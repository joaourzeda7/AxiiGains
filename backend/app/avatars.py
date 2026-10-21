"""Processamento da foto de perfil.

Uma foto de celular tem ~3-5 MB, pode vir "deitada" e costuma carregar metadados (EXIF)
com a LOCALIZAÇÃO GPS de onde foi tirada. Por isso nunca salvamos o arquivo enviado:
abrimos com a Pillow, desenhamos uma imagem NOVA de 256×256 e salvamos só os pixels.
"""
import io

from PIL import Image, ImageOps, UnidentifiedImageError

SIZE = 256
MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB
# Uma "bomba de descompressão" é um arquivo pequeno que vira uma imagem gigantesca na
# memória ao ser aberto (ex.: 50.000 × 50.000 pixels). Barramos antes de carregar os pixels.
MAX_PIXELS = 40_000_000
ACCEPTED_FORMATS = {"JPEG", "MPO", "PNG", "WEBP", "GIF"}  # MPO = JPEG de alguns iPhones


class InvalidImage(ValueError):
    pass


def make_avatar(data: bytes) -> bytes:
    """Recebe o arquivo enviado e devolve uma foto quadrada 256×256 em WebP, sem metadados."""
    try:
        with Image.open(io.BytesIO(data)) as img:
            # Até aqui a Pillow só leu o cabeçalho: dá para recusar sem gastar memória
            if img.format not in ACCEPTED_FORMATS:
                raise InvalidImage("Formato não suportado. Envie uma foto JPG, PNG ou WebP.")
            if img.width * img.height > MAX_PIXELS:
                raise InvalidImage("Imagem grande demais.")
            img.load()
            # Celulares gravam a foto "deitada" e só anotam a rotação no EXIF; aplicamos aqui
            img = ImageOps.exif_transpose(img)
            mode = "RGBA" if img.mode in ("RGBA", "LA", "P") else "RGB"
            # fit = recorta o centro em quadrado e redimensiona (sem distorcer o rosto)
            square = ImageOps.fit(img.convert(mode), (SIZE, SIZE), method=Image.Resampling.LANCZOS)
    except InvalidImage:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, SyntaxError):
        raise InvalidImage("Não consegui ler essa imagem. Envie uma foto JPG, PNG ou WebP.")

    out = io.BytesIO()
    # Imagem nova, salva sem passar exif=...: nenhum metadado do arquivo original sobrevive
    square.save(out, "WEBP", quality=82, method=6)
    return out.getvalue()
