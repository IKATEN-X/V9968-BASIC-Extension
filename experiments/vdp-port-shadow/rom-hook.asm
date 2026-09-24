; 既存のRAMコピー・復元処理を使い、0047hの差し替えだけを追加する。
    include "probe.asm"

defc REQUEST_REG = $c016
defc REQUEST_VALUE = $c017
defc CHECK_ERROR = $c018
defc SP_BEFORE = $c020
defc SP_AFTER = $c022
defc RETURN_HL = $c024
defc RETURN_DE = $c026
defc RETURN_IX = $c028
defc RETURN_IY = $c02a
defc SLOT_BEFORE = $c02c
defc SLOT_AFTER = $c02d

hook_install:
    push af
    push bc
    push de
    push hl
    di
    ld a,(hook_active)
    or a
    jp nz,done
    ld a,(ACTIVE)
    or a
    jr z,hook_invalid
    ld hl,$0047
    ld de,saved_jump
    ld bc,3
    ldir
    ld hl,($0048)
    ld (native_jump+1),hl
    ld hl,rom_bridge
    ld ($0048),hl
    ld a,1
    ld (hook_active),a
    jp done
hook_invalid:
    ld a,$80
    ld (CHECK_ERROR),a
    jp done

hook_remove:
    push af
    push bc
    push de
    push hl
    di
    ld a,(hook_active)
    or a
    jp z,done
    ld a,(ACTIVE)
    or a
    jr z,hook_invalid
    ld hl,saved_jump
    ld de,$0047
    ld bc,3
    ldir
    xor a
    ld (hook_active),a
    jp done

; ページ1のBASICを一時的に隠すため、中継は予約済みのページ3に置く。
; この専用構成では、実験ROMは非拡張の基本スロット1に挿入する。
rom_bridge:
    ld a,c
    cp 7
    jp nz,native_jump
    push ix
    push iy
    rst $30
    defb 1
    defw $4020
    pop iy
    pop ix
    ei
    ret
native_jump:
    jp 0

; 呼び出す側の検証。保存対象レジスタ、SP、基本スロットを毎回比較する。
checked_call:
    push af
    push bc
    push de
    push hl
    push ix
    push iy
    ld hl,0
    add hl,sp
    ld (SP_BEFORE),hl
    in a,($a8)
    ld (SLOT_BEFORE),a
    ld a,(REQUEST_VALUE)
    ld b,a
    ld a,(REQUEST_REG)
    ld c,a
    ld hl,$3456
    ld de,$5678
    ld ix,$1357
    ld iy,$2468
    call $0047
    ld (RETURN_HL),hl
    ld (RETURN_DE),de
    ld (RETURN_IX),ix
    ld (RETURN_IY),iy
    ld hl,0
    add hl,sp
    ld (SP_AFTER),hl
    in a,($a8)
    ld (SLOT_AFTER),a
    ld e,0
    ld hl,(RETURN_HL)
    ld bc,$3456
    or a
    sbc hl,bc
    jr z,check_de
    set 0,e
check_de:
    ld hl,(RETURN_DE)
    ld bc,$5678
    or a
    sbc hl,bc
    jr z,check_ix
    set 1,e
check_ix:
    ld hl,(RETURN_IX)
    ld bc,$1357
    or a
    sbc hl,bc
    jr z,check_iy
    set 2,e
check_iy:
    ld hl,(RETURN_IY)
    ld bc,$2468
    or a
    sbc hl,bc
    jr z,check_sp
    set 3,e
check_sp:
    ld hl,(SP_AFTER)
    ld bc,(SP_BEFORE)
    or a
    sbc hl,bc
    jr z,check_slot
    set 4,e
check_slot:
    ld a,(SLOT_BEFORE)
    ld hl,SLOT_AFTER
    cp (hl)
    jr z,check_end
    set 5,e
check_end:
    ld a,(CHECK_ERROR)
    or e
    ld (CHECK_ERROR),a
    pop iy
    pop ix
    jp done

hook_active: defb 0
saved_jump: defb 0,0,0
