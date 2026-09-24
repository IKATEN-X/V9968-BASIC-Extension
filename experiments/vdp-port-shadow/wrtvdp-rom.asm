; 0047hの差し替え検証専用ROM。通常の拡張BASICには組み込まない。
    org $4000
    defb "AB"
    defw rom_init,0,0,0,0,0,0
rom_init:
    ret
    defs 15,$ff

; 固定入口4020h。中継側でC=7だけを渡す。Bは書き込み値。
; BIOSコードの複製ではなく、R#7の書き込みと保存値更新のみを実装する。
rom_wrtvdp:
    ld a,b
    ld (RG7SAV),a
    ld a,($0007)
    inc a
    ld c,a
    di
    out (c),b
    ld a,$87
    out (c),a
    ei
    ret

defc RG7SAV = $f3e6
