# Prompt: Branded QR Code Generator with Embedded Logo

## Goal

Build a Python function/script that generates QR codes with the Eco-Thrift circular logo embedded in the center. The QR code must remain scannable after the logo is applied. This will be used on retail price labels (1.5" x 1" thermal labels at 203 DPI).

## Context

I currently generate price labels that have a QR code in the bottom-left corner and the Eco-Thrift logo + text separately in the bottom-right. I want to embed the circular part of my logo directly into the center of the QR code so I can reclaim the space the logo currently occupies and use it for the "Eco-Thrift" text or additional product info.

## Input Files

- `logo-icon-120x120.png` - The circular Eco-Thrift logo (green leaf/chevron design on a circular background, 120x120px). This is the image to embed in the center of the QR code.

## Requirements

### QR Code Generation
- Use Python (preferred libraries: `qrcode`, `Pillow`)
- Generate QR codes with **error correction level H** (High, 30% redundancy) so the code remains scannable even with the logo covering center modules
- The QR code content will be a URL string passed as a parameter
- QR code output size should be configurable, but default to **150x150 pixels** (suitable for the label's bottom-left area at 203 DPI)

### Logo Embedding
- Load `logo-icon-120x120.png` and resize it to fit the center of the QR code
- The logo should cover no more than **20-25% of the total QR code area** to stay safely within H-level error correction tolerance
- For a 150x150 QR code, the logo overlay should be roughly **50x50 to 58x58 pixels**
- Center the logo precisely on the QR code
- The logo image has a circular shape with transparency. Composite it properly so the circular shape shows cleanly over the QR modules.
- Add a small **white circular padding/border** (2-3px) behind the logo before compositing, so the logo doesn't blend into the dark QR modules around its edges

### Function Signature

```python
def generate_branded_qr(
    data: str,                    # URL or text to encode
    logo_path: str,               # Path to the circular logo image
    output_path: str,             # Where to save the result
    qr_size: int = 150,           # Output QR code size in pixels
    logo_ratio: float = 0.35,     # Logo diameter as a fraction of QR code size (0.35 = 35% of width)
    padding: int = 2              # White border pixels around the logo
) -> str:                         # Returns the output file path
```

### Output
- Save as PNG with no extra whitespace/border around the QR code (or minimal, 1-2 module quiet zone)
- The QR code background should be **white** and the modules should be **black** (standard)
- The output needs to look clean at small sizes since it will be printed on a 1.5" x 1" label

### Validation
- After generating, the script should optionally attempt to decode the QR code (using `pyzbar` or similar) to verify it is still scannable with the logo overlay
- Print a warning if the QR code fails to decode after logo embedding

## Example Usage

```python
generate_branded_qr(
    data="https://eco-thrift.com/item/12345",
    logo_path="logo-icon-120x120.png",
    output_path="branded_qr_output.png",
    qr_size=150,
    logo_ratio=0.35,
    padding=3
)
```

## Nice to Have (Optional)

- A batch mode that takes a list/CSV of URLs and generates branded QR codes for each
- Option to adjust the white padding ring thickness
- Option to make the logo circular crop automatic (in case a non-circular logo is provided, apply a circular mask)
- CLI interface so it can be called from the command line:
  ```
  python branded_qr.py --data "https://eco-thrift.com/item/123" --logo logo-icon-120x120.png --output qr_123.png
  ```

## Testing

Generate at least 3 test QR codes with different URLs and verify all three scan correctly using a phone camera or a QR decoding library. Test at the target print size (150x150px) to make sure the codes are not too dense to scan at that resolution.
