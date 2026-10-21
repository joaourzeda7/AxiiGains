"""Foto de perfil: processamento seguro da imagem, privacidade e acesso."""
import io

import pytest
from PIL import Image

from app.config import AVATAR_DIR

RED, BLUE = (220, 20, 20), (20, 20, 220)


def image_bytes(fmt="PNG", size=(400, 300), color=RED, exif=None, mode="RGB"):
    img = Image.new(mode, size, color if mode != "1" else 1)
    out = io.BytesIO()
    if exif is not None:
        img.save(out, fmt, exif=exif)
    else:
        img.save(out, fmt)
    return out.getvalue()


def upload(client, headers, data, filename="foto.png", content_type="image/png"):
    return client.put("/api/auth/me/avatar", headers=headers, files={"file": (filename, data, content_type)})


def fetch_avatar(client, url):
    r = client.get(url)
    assert r.status_code == 200, r.text
    return r, Image.open(io.BytesIO(r.content))


def test_upload_returns_square_webp(client, auth):
    r = upload(client, auth, image_bytes(size=(1200, 800)))
    assert r.status_code == 200
    url = r.json()["avatar_url"]
    assert url.startswith("/api/avatars/") and url.endswith(".webp")

    resp, img = fetch_avatar(client, url)
    assert resp.headers["content-type"] == "image/webp"
    assert img.format == "WEBP" and img.size == (256, 256)
    # a foto nunca muda (trocar gera outro nome): pode ficar em cache
    assert "immutable" in resp.headers["cache-control"]
    assert client.get("/api/auth/me", headers=auth).json()["avatar_url"] == url


def test_gps_location_and_other_metadata_are_removed(client, auth):
    exif = Image.Exif()
    exif[0x010F] = "Apple"  # fabricante
    exif[0x8825] = {2: (23.0, 32.0, 0.0), 1: "S", 4: (46.0, 38.0, 0.0), 3: "W"}  # GPS: São Paulo
    original = image_bytes("JPEG", exif=exif)
    assert Image.open(io.BytesIO(original)).getexif()  # o arquivo enviado tem EXIF

    url = upload(client, auth, original, "foto.jpg", "image/jpeg").json()["avatar_url"]
    _, img = fetch_avatar(client, url)
    assert not img.getexif()
    assert "exif" not in img.info


def test_sideways_phone_photo_is_rotated(client, auth):
    """Celulares salvam a foto "deitada" e só anotam a rotação no EXIF (orientation=6)."""
    img = Image.new("RGB", (400, 200), RED)
    img.paste(BLUE, (200, 0, 400, 200))  # esquerda vermelha, direita azul
    exif = Image.Exif()
    exif[0x0112] = 6  # "gire 90° no sentido horário para exibir"
    out = io.BytesIO()
    img.save(out, "JPEG", exif=exif)

    url = upload(client, auth, out.getvalue(), "foto.jpg", "image/jpeg").json()["avatar_url"]
    _, avatar = fetch_avatar(client, url)
    top, bottom = avatar.convert("RGB").getpixel((128, 10)), avatar.convert("RGB").getpixel((128, 245))
    assert top[0] > top[2], "depois de girar, o vermelho fica em cima"
    assert bottom[2] > bottom[0], "e o azul embaixo"


def test_transparent_png_keeps_transparency(client, auth):
    url = upload(client, auth, image_bytes(mode="RGBA", color=(0, 0, 0, 0))).json()["avatar_url"]
    _, img = fetch_avatar(client, url)
    assert img.mode == "RGBA"


@pytest.mark.parametrize(
    "data, filename, content_type",
    [
        (b"isto nao e uma imagem", "foto.jpg", "image/jpeg"),  # texto disfarçado de .jpg
        (b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", "foto.svg", "image/svg+xml"),  # SVG pode ter script
        (b"%PDF-1.4 ...", "foto.png", "image/png"),
        (b"", "vazio.png", "image/png"),
    ],
)
def test_non_images_are_rejected(client, auth, data, filename, content_type):
    r = upload(client, auth, data, filename, content_type)
    assert r.status_code == 422
    assert client.get("/api/auth/me", headers=auth).json()["avatar_url"] is None


def test_image_format_not_accepted(client, auth):
    r = upload(client, auth, image_bytes("BMP"), "foto.bmp", "image/bmp")
    assert r.status_code == 422 and "Formato" in r.json()["detail"]


def test_decompression_bomb_is_rejected_without_loading_it(client, auth):
    # 8000 × 8000 = 64 milhões de pixels num PNG de poucos KB
    bomb = image_bytes(size=(8000, 8000), mode="1")
    assert len(bomb) < 100_000
    assert upload(client, auth, bomb).status_code == 422


def test_file_over_8mb_is_rejected(client, auth):
    assert upload(client, auth, b"\0" * (8 * 1024 * 1024 + 1)).status_code == 413


def test_huge_request_is_refused_before_being_read(client, auth):
    assert upload(client, auth, b"\0" * (11 * 1024 * 1024)).status_code == 413


def test_new_photo_replaces_and_deletes_the_old_file(client, auth):
    first = upload(client, auth, image_bytes(color=RED)).json()["avatar_url"]
    second = upload(client, auth, image_bytes(color=BLUE)).json()["avatar_url"]
    assert first != second
    assert client.get(first).status_code == 404  # arquivo antigo removido do disco
    assert not (AVATAR_DIR / first.rsplit("/", 1)[1]).exists()
    assert client.get(second).status_code == 200


def test_delete_photo(client, auth):
    url = upload(client, auth, image_bytes()).json()["avatar_url"]
    r = client.delete("/api/auth/me/avatar", headers=auth)
    assert r.status_code == 200 and r.json()["avatar_url"] is None
    assert client.get(url).status_code == 404


@pytest.mark.parametrize(
    "name",
    ["../axiigains.db", "..%2Faxiigains.db", "abc.webp", "A" * 32 + ".webp", "0" * 32 + ".png", "0" * 32 + ".webp"],
)
def test_only_valid_existing_avatar_names_are_served(client, name):
    assert client.get(f"/api/avatars/{name}").status_code == 404


def test_upload_requires_login(client):
    assert upload(client, {}, image_bytes()).status_code == 401


def test_each_user_has_their_own_photo(client, register):
    ana, _ = register()
    bia, _ = register()
    url = upload(client, ana, image_bytes()).json()["avatar_url"]
    assert client.get("/api/auth/me", headers=bia).json()["avatar_url"] is None
    client.delete("/api/auth/me/avatar", headers=bia)  # apagar a "própria" foto não mexe na da Ana
    assert client.get(url).status_code == 200


def test_photo_changes_are_rate_limited(client, auth):
    for _ in range(10):
        assert upload(client, auth, image_bytes(size=(50, 50))).status_code == 200
    assert upload(client, auth, image_bytes(size=(50, 50))).status_code == 429
