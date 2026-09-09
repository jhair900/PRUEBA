#!/usr/bin/env python3
"""Prepare commission and legal-person prestation templates."""

from pathlib import Path

from prepare_dilileg_templates import (
    patch_docx,
    replace_exact_paragraphs,
    replace_in_paragraphs,
    set_vehicle_cell,
)


VEHICLE_FIELDS = (
    ("PLACA", "{PLACA}"),
    ("COLOR", "{COLOR}"),
    ("MARCA", "{MARCA}"),
    ("AÑO", "{ANIO}"),
    ("MODELO", "{MODELO}"),
    ("CHASIS", "{CHASIS}"),
    ("MOTOR", "{MOTOR}"),
    ("KM", "{KM}"),
)


def patch_common(root, price_clause, price_blank="___________________"):
    replace_in_paragraphs(
        root,
        "En el Distrito Metropolitano de Quito",
        "___ días del mes de a_____ del 202_",
        "{FECHA_DIA} días del mes de {FECHA_MES} del {FECHA_ANIO}",
    )
    replace_in_paragraphs(root, price_clause, price_blank, "{VALOR_TEXT} ")
    replace_in_paragraphs(root, price_clause, "______", "{VALOR_NUM}")
    replace_in_paragraphs(root, "DÉCIMA PRIMERA: NOTIFICACIONES", "xxxxxxxx", "{DOMICILIO_PROP}")
    replace_in_paragraphs(root, "DÉCIMA PRIMERA: NOTIFICACIONES", "xxxx", "{EMAIL_PROP}")
    for label, placeholder in VEHICLE_FIELDS:
        set_vehicle_cell(root, label, placeholder)


def patch_natural_commission(root, married):
    patch_common(root, "CUARTA: PRECIO")
    replace_in_paragraphs(root, "comparecen a la celebración", "______________________", "{NOMBRE_PROP}")
    if married:
        replace_in_paragraphs(root, "comparecen a la celebración", "______________________", "{NOMBRE_CONY}")


def patch_legal(root, commission):
    patch_common(
        root,
        "CUARTA: PRECIO" if commission else "TERCERA: PRECIO",
        "___________________" if commission else "__________________",
    )
    replace_in_paragraphs(root, "comparecen a la celebración", "______________________", "{REPRESENTANTE_LEGAL}")
    replace_in_paragraphs(
        root,
        "comparecen a la celebración",
        "_______________" if commission else "____________",
        "{ESTADO_CIVIL_REP}",
    )
    replace_in_paragraphs(
        root,
        "comparecen a la celebración",
        "________________________________________" if commission else "_______________________________________________",
        "{RAZON_SOCIAL}",
    )
    replace_in_paragraphs(
        root,
        "comparecen a la celebración",
        "___________________" if commission else "_______________________",
        "{RUC}",
    )


def patch_legal_encargo(root):
    constituent = "{REPRESENTANTE_LEGAL} en calidad de representante legal de {RAZON_SOCIAL}"
    replace_in_paragraphs(root, "Razón Social:", "_______________", "{RAZON_SOCIAL}")
    replace_in_paragraphs(root, "Representante Legal:", "_______________", "{REPRESENTANTE_LEGAL}")
    replace_in_paragraphs(
        root,
        "Número de Identificación:",
        "_______________ / __________",
        "{RUC} / {CI_REPRESENTANTE}",
    )
    replace_in_paragraphs(root, "Estado Civil:", "_______________", "{ESTADO_CIVIL_REP}")
    replace_in_paragraphs(root, "Nacionalidad:", "_______________", "{NACIONALIDAD_PROP}")
    replace_in_paragraphs(root, "Domicilio:", "_______________", "{DOMICILIO_PROP}")
    replace_in_paragraphs(root, "Teléfono:", "_______________", "{TELEFONO_PROP}")
    replace_in_paragraphs(root, "Correo electrónico:", "_______________", "{EMAIL_PROP}")
    replace_in_paragraphs(root, "CONSTITUYENTE:", "_______________________", constituent)
    replace_in_paragraphs(root, "BENEFICIARIO:", "_______________________", constituent)
    replace_in_paragraphs(root, "ENCARGO FIDUCIARIO:", "_______", "{PLACA}")
    replace_in_paragraphs(
        root,
        "documento privado suscrito el",
        "__________",
        "{FECHA_CONTRATO_DIA} de {FECHA_CONTRATO_MES} del {FECHA_CONTRATO_ANIO}",
    )
    replace_in_paragraphs(root, "CLÁUSULA TERCERA", "_______", "{PLACA}")
    replace_in_paragraphs(root, "CLÁUSULA CUARTA", "___________________", constituent)

    for label, placeholder in (
        ("Marca:", "{MARCA}"),
        ("Modelo:", "{MODELO}"),
        ("Año:", "{ANIO}"),
        ("Chasis:", "{CHASIS}"),
        ("Motor:", "{MOTOR}"),
        ("Placa:", "{PLACA}"),
    ):
        replace_in_paragraphs(root, label, "________________", placeholder, expected=2)

    replace_in_paragraphs(root, "25.1", "_______________", "{DOMICILIO_PROP}")
    replace_in_paragraphs(root, "25.1", "__________", "{TELEFONO_PROP}")
    replace_in_paragraphs(root, "25.1", "_______________", "{EMAIL_PROP}")
    replace_in_paragraphs(root, "25.2", "________________", "{DOMICILIO_GENERADOR}")
    replace_in_paragraphs(root, "25.2", "_______________", "{EMAIL_GENERADOR}")
    replace_in_paragraphs(root, "25.3", "_________________", "{EMAIL_FIDUCIARIA}")
    replace_in_paragraphs(
        root,
        "En Quito, a los",
        "__ días del mes de _______________ del ____________",
        "{FECHA_DIA} días del mes de {FECHA_MES} del {FECHA_ANIO}",
    )

    replace_exact_paragraphs(root, "(NOMBRE)", ("{REPRESENTANTE_LEGAL}", "{REPRESENTANTE_LEGAL}"))
    replace_exact_paragraphs(root, "C.C.", ("C.C. {CI_REPRESENTANTE}", "C.C. {CI_REPRESENTANTE}"))
    replace_exact_paragraphs(root, "CARGO", ("Representante Legal", "Representante Legal"))
    replace_exact_paragraphs(root, "DENOMINACIÓN SOCIAL", ("{RAZON_SOCIAL}", "{RAZON_SOCIAL}"))
    replace_in_paragraphs(root, "RUC:", "______________", "{RUC}", expected=3)


def main():
    downloads = Path.home() / "Downloads"
    output = Path(__file__).resolve().parents[1] / "templates"
    jobs = (
        (
            downloads / "PRESTACIÓN DE SERVICIO_SOLTERO_DILILEG_comision (1).docx",
            output / "prestacion-comision-soltero.docx",
            lambda root: patch_natural_commission(root, False),
        ),
        (
            downloads / "PRESTACIÓN DE SERVICIO_CASADO_DILILEG_comision (1).docx",
            output / "prestacion-comision-casado.docx",
            lambda root: patch_natural_commission(root, True),
        ),
        (
            downloads / "PRESTACIÓN DE SERVICIO_PERSONA JURIDICA_DILILEG (1).docx",
            output / "prestacion-juridica-directa.docx",
            lambda root: patch_legal(root, False),
        ),
        (
            downloads / "PRESTACIÓN DE SERVICIO_DILILEG_comision_PERSONA JURIDICA (1).docx",
            output / "prestacion-juridica-comision.docx",
            lambda root: patch_legal(root, True),
        ),
        (
            downloads / "Encargo Fiduciario Dilileg  V.F PJ - copia OK.docx",
            output / "encargo-juridica.docx",
            patch_legal_encargo,
        ),
    )
    for source, destination, patcher in jobs:
        if not source.exists():
            raise FileNotFoundError(source)
        patch_docx(source, destination, patcher)
        print(f"Prepared {destination.name} from {source.name}")


if __name__ == "__main__":
    main()
