; 専用のディスクなしMSX2+構成だけで使う実験。拡張BASICには組み込まない。
; BASICのCLEARでC000h以上を予約してからロードする。
; ページ0のRAMコピーには、専用構成で未使用のマッパーセグメント4を使う。
    org $c100
    jp install_shadow
    jp reference_ports
    jp native_wrtvdp
    jp restore_bios

defc RESULT_ID = $c010
defc ACTIVE = $c011
defc EXTERNAL_R7 = $c014
defc EXTERNAL_R21 = $c015
defc RG7SAV = $f3e6

install_shadow:
    push af
    push bc
    push de
    push hl
    di
    ld a,(ACTIVE)
    or a
    jp nz,done
    in a,($a8)
    ld (saved_primary),a
    ld a,($ffff)
    cpl
    ld (saved_secondary),a
    in a,($fc)
    ld (saved_mapper0),a
    in a,($fd)
    ld (saved_mapper1),a
    ld a,(RG7SAV)
    ld (saved_r7),a

IFDEF FULL_SHADOW
    in a,($fe)
    ld (saved_mapper2),a
    ld a,($fcc1)
    ld (saved_exptbl0),a
    ld a,($fff7)
    ld (saved_mainrom),a
    ld hl,$fcc5
    ld de,saved_slttbl
    ld bc,4
    ldir

    ; ページ2を一時的なコピー先にする。BASICの本文は隠すだけで上書きしない。
    ld a,4
    out ($fe),a
    ld a,(saved_secondary)
    and $cf
    ld ($ffff),a
    ld a,(saved_primary)
    or $30
    out ($a8),a
    ld hl,0
    ld de,$8000
    ld bc,$4000
    ldir
    ld a,$88
    ld ($8006),a
    ld ($8007),a
    ld a,5
    out ($fe),a
    ld hl,$4000
    ld de,$8000
    ld bc,$4000
    ldir

    ; 本文を元に戻し、ページ0・1をRAMスロット3-0のセグメント4・5へ移す。
    ld a,(saved_mapper2)
    out ($fe),a
    ld a,(saved_secondary)
    and $f0
    ld ($ffff),a
    ld ($fcc8),a
    ld a,4
    out ($fc),a
    ld a,5
    out ($fd),a
    ld a,(saved_primary)
    or $0f
    out ($a8),a

    ; C019h=0は管理情報を変更しない比較用。それ以外は新しい所在を登録する。
    ld a,($c019)
    or a
    jr z,shadow_ready
    ld a,$83
    ld ($fcc1),a
    ld ($fff7),a
shadow_ready:
ELSE
    ; ページ1へ未使用RAMを一時配置する。実行コードとスタックは切り替えない。
    ld a,4
    out ($fd),a
    ld a,(saved_secondary)
    and $f3
    ld ($ffff),a
    ld a,(saved_primary)
    or $0c
    out ($a8),a
    ld hl,0
    ld de,$4000
    ld bc,$4000
    ldir
    ld a,$88
    ld ($4006),a
    ld ($4007),a

    ; ページ1を元に戻した後、コピーをページ0として選択する。
    ld a,(saved_primary)
    out ($a8),a
    ld a,(saved_mapper1)
    out ($fd),a
    ld a,(saved_secondary)
    and $fc
    ld ($ffff),a
    ld a,4
    out ($fc),a
    ld a,(saved_primary)
    or 3
    out ($a8),a
ENDIF
    ld a,1
    ld (ACTIVE),a
    jp done

reference_ports:
    push af
    push bc
    push de
    push hl
    di
    ; 0007hを参照してR#7へ書く。BIOSのレジスタ保存値は変更しない。
    ld a,($0007)
    inc a
    ld c,a
    ld a,(RG7SAV)
    and $f0
    or 12
    out (c),a
    ld a,$87
    out (c),a

    ; 外付け側だけ、初期状態のV9958互換IDを一時解除する。
    ld a,c
    cp $89
    jr nz,read_id
    ld a,(EXTERNAL_R21)
    and $fe
    out (c),a
    ld a,$95
    out (c),a
read_id:
    ; S#1の選択は0007h、読み出しは0006hを使い、最後にS#0へ戻す。
    ld a,1
    out (c),a
    ld a,$8f
    out (c),a
    ld a,($0006)
    inc a
    ld c,a
    in a,(c)
    and $3e
    ld (RESULT_ID),a
    ld a,($0007)
    inc a
    ld c,a
    xor a
    out (c),a
    ld a,$8f
    out (c),a
    ld a,c
    cp $89
    jp nz,done
    ld a,(EXTERNAL_R21)
    out (c),a
    ld a,$95
    out (c),a
    jp done

native_wrtvdp:
    push af
    push bc
    push de
    push hl
    ld a,(RG7SAV)
    and $f0
    or 10
    ld b,a
    ld c,7
    call $0047
    jp done

restore_bios:
    push af
    push bc
    push de
    push hl
    di
    ld a,(ACTIVE)
    or a
    jp z,done
IFDEF FULL_SHADOW
    ld a,(saved_exptbl0)
    ld ($fcc1),a
    ld a,(saved_mainrom)
    ld ($fff7),a
    ld hl,saved_slttbl
    ld de,$fcc5
    ld bc,4
    ldir
    ld a,(saved_mapper2)
    out ($fe),a
ENDIF
    ld a,(saved_primary)
    out ($a8),a
    ld a,(saved_secondary)
    ld ($ffff),a
    ld a,(saved_mapper0)
    out ($fc),a
    ld a,(saved_mapper1)
    out ($fd),a
    ; 固定ポートへの書き込みは、実験前の両VDPの状態へ戻すためだけに使う。
    ld a,(saved_r7)
    ld (RG7SAV),a
    out ($99),a
    ld a,$87
    out ($99),a
    ld a,(EXTERNAL_R7)
    out ($89),a
    ld a,$87
    out ($89),a
    xor a
    ld (ACTIVE),a
done:
    pop hl
    pop de
    pop bc
    pop af
    ei
    ret

saved_primary:   defb 0
saved_secondary: defb 0
saved_mapper0:   defb 0
saved_mapper1:   defb 0
saved_r7:        defb 0
IFDEF FULL_SHADOW
saved_mapper2:   defb 0
saved_exptbl0:   defb 0
saved_mainrom:   defb 0
saved_slttbl:    defs 4,0
ENDIF
