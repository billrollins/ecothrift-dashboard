"""ThriftBucks mark for the receipt printer (ESC/POS, font A 12 x 24): two user-defined characters, 0x7E then 0x7F.
Send DEFINE once after ESC @, then ENABLE; print the mark as the two bytes b"\x7e\x7f"; DISABLE before normal text that uses ~.
If a printer ignores user-defined characters, print receipt/tb-receipt-24.png as a raster image instead."""
DEFINE = b'\x1b&\x03~\x7f\x0c\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x01\x80\x00c\x800s\x81\x18w?\x9cw\xff\x1c\x7f\x87\x9c~\x7f\xdc\x7f\xff\xbc\x0c\x7f\xbe8~<xv|\xf0s\xe7\xe0p\x01\x80p\x00\x00p\x00\x00`\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00'
ENABLE = b'\x1b%\x01'
DISABLE = b'\x1b%\x00'
MARK = b'\x7e\x7f'
