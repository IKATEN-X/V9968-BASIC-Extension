; 割り込みハンドラーはBASICが管理する。割り込みを許可する前にS#0の選択へ戻す。
; これらの入口は、割り込みが許可されたBASICからのみ呼び出す。
write_reg:
    di
    out ($99),a
    ld a,c
    or $80
    out ($99),a
    ei
    ret
read_status:
    di
    out ($99),a
    ld a,$8f
    out ($99),a
    in a,($99)
    push af
    xor a
    out ($99),a
    ld a,$8f
    out ($99),a
    pop af
    ei
    ret
detect_v9968:
    ld a,($002d)
    or a
    jp z,illegal
    ld a,1
    call read_status
    and $3e
    cp 6
    ret z
    ; V58互換モードではIDもV9958になる。一時解除して検出し、元のモードへ戻す。
    ld a,(RG21SAV)
    and $fe
    ld c,21
    call write_reg
    ld a,1
    call read_status
    push af
    ld a,(RG21SAV)
    ld c,21
    call write_reg
    pop af
    and $3e
    cp 6
    jp nz,illegal
    ret
enable_v9968:
    call detect_v9968
    ld a,(RG21SAV)
    and $fe                 ; V58=0で拡張コマンドと256KB VRAMを有効にする。
    call write_mode21
    ld a,(RG20SAV)
    and $9f                 ; 旧ECOM/EVRビットは現行定義では使わない。
    or $11                  ; HS | EPALを有効にする。
write_mode20:
    ld (RG20SAV),a
    ld c,20
    jp write_reg
write_mode21:
    ld (RG21SAV),a
    ld c,21
    jp write_reg
require_graphics:
    call drawing_mode
    cp 5
    jr z,graphics_narrow
    cp 8
    jr nz,graphics_wide
    call require_planar_graphics
    ; 標準SCREEN 10..12もSCRMODに8を格納する。YJKをRGBとして扱わない。
    ld a,(RG25SAV)
    and 8
    jp nz,illegal
    jr graphics_narrow
graphics_wide:
    cp 6
    jr z,graphics_mode_ready
    cp 7
    jp nz,illegal
    call require_planar_graphics
    jr graphics_mode_ready
graphics_narrow:
    ld a,(ix+SX1H)
    or (ix+SX2H)
    or (ix+DX1H)
    or (ix+DX2H)
    jp nz,illegal
graphics_mode_ready:
    call require_drawing_extensions
    ld a,(ix+SPAGE)
    call validate_drawing_page
    ld a,(ix+DPAGE)
    call validate_drawing_page
    bit 7,(ix+13)
    jr nz,graphics_low_y
    ld a,(RG21SAV)
    bit 6,a
    ret nz
graphics_low_y:
    ld a,(ix+SY1H)
    or (ix+SY2H)
    or (ix+DY1H)
    or (ix+DY2H)
    jp nz,illegal
    ret
require_planar_graphics:
    ; 標準SCREENでSP3が残ると連続配列になる。予約領域の対応前は描画を拒否する。
    ld a,(RG20SAV)
    and 8
    jp nz,illegal
    ret
require_normal_graphics:
    ld a,(SCRMOD)
    cp 5
    jp nz,illegal
    ld a,(RG21SAV)
    bit 6,a
    jp nz,illegal           ; FILでのフォント・スプライト座標は未対応。
    jp require_graphics

require_drawing_extensions:
require_extended_commands:
    ld a,(RG21SAV)
    bit 0,a                 ; V58=1では拡張コマンドも上位VRAMも使えない。
    jp nz,illegal
    jp detect_v9968

require_palette:
    ld a,(RG20SAV)
    and $10
    jp z,illegal
    jp detect_v9968

; 標準命令で扱えないコマンドパラメーターだけを公開する。制御状態のRAMミラーは持たない。
cmd_vdp:
    call open_args
    call get_byte
    cp 48
    jp c,illegal
    cp 60
    jp nc,illegal
    dec a
    ld (ix+TEMP),a
    call close_args
    ld a,$ef                ; BASICのトークン化された「=」。
    call expect
    call get_byte
    ld (ix+COLOR),a
    call end_statement
    call require_extended_commands
    call wait_vdp
    ld c,(ix+TEMP)
    ld a,(ix+COLOR)
    jp write_reg

wait_vdp:
    ld a,2
    call read_status
    and 1
    jr nz,wait_vdp
    ret
cmd_wait_vdp:
    call end_statement
    jp wait_vdp
cmd_wait_vblank:
    call end_statement
wait_leave_vblank:
    ld a,2
    call read_status
    and $40
    jr nz,wait_leave_vblank
wait_enter_vblank:
    ld a,2
    call read_status
    and $40
    jr z,wait_enter_vblank
    ret

cmd_init:
    call end_statement
    jp enable_v9968

; 既存の256バイトCALLフレーム内にSCREEN用の項目を置く。常駐RAMは使わない。
; 標準命令用の引数バッファは最大18バイト（6個のバイト定数トークンとカンマなど）。
defc SCREEN_VALUES = 0
defc SCREEN_FLAGS = 8
defc SCREEN_INDEX = 9
defc SCREEN_MASK = 10
defc SCREEN_END = 11
defc SCREEN_TEXT = 64

cmd_screen:
    ld (ix+SCREEN_MASK),1
    call open_args
screen_arg:
    call skip_space
    cp ','
    jr z,screen_next_arg
    cp ')'
    jp z,syntax_error       ; 空の呼び出しと、末尾の省略項目は認めない。
    call get_byte
    ld b,a
    push hl
    push ix
    pop hl
    ld e,(ix+SCREEN_INDEX)
    ld d,0
    add hl,de
    ld (hl),b
    pop hl
    ld a,(ix+SCREEN_FLAGS)
    or (ix+SCREEN_MASK)
    ld (ix+SCREEN_FLAGS),a
    call skip_space
    cp ')'
    jr z,screen_parsed
screen_next_arg:
    ld a,(ix+SCREEN_INDEX)
    cp 7
    jp nc,syntax_error
    inc (ix+SCREEN_INDEX)
    sla (ix+SCREEN_MASK)
    call comma
    jr screen_arg
screen_parsed:
    call close_args
    call end_statement
    ld a,(ix+SCREEN_VALUES)
    cp 5
    jr z,screen_check_args
    cp 6
    jr z,screen_check_args
    cp 7
    jr z,screen_check_args
    cp 8
    jr z,screen_check_args
    or a
    jp nz,illegal
screen_check_args:
    ld a,(ix+SCREEN_VALUES+1)
    cp 4
    jp nc,illegal
    bit 3,(ix+SCREEN_FLAGS)
    jr z,screen_check_interlace
    ld a,(ix+SCREEN_VALUES+3)
    dec a
    cp 2
    jp nc,illegal
screen_check_interlace:
    ld a,(ix+SCREEN_VALUES+5)
    cp 5
    jp nc,illegal
    ld a,(ix+SCREEN_VALUES+6)
    cp 4
    jp nc,illegal
    ld a,(ix+SCREEN_VALUES+7)
    cp 2
    jp nc,illegal
    call detect_v9968
    ld a,($002d)
    cp 2
    jp c,illegal           ; R#25のBASIC側の保存値はMSX2+以降に存在する。
    ld a,(ix+SCREEN_VALUES+6)
    or (ix+SCREEN_VALUES+7)
    jr z,screen_validated
    ld a,(ix+SCREEN_VALUES)
    bit 0,(ix+SCREEN_FLAGS)
    jr nz,screen_check_sprite_flags
    ld a,(SCRMOD)
screen_check_sprite_flags:
    or a
    jp z,illegal           ; TEXTモードではスプライトを使えない。OFF指定は許可する。
    cp 13
    jp nc,illegal
screen_validated:
    ld a,(ix+SCREEN_VALUES+5)
    cp 4
    call z,screen_validate_fil
    bit 0,(ix+SCREEN_FLAGS)
    jr nz,screen_initialize
    bit 1,(ix+SCREEN_FLAGS)
    jr z,screen_partial
    ; 標準のサイズ変更はスプライトテーブルを消去する。使用中の予約領域には触れない。
    ld a,(RG20SAV)
    and 8
    jp nz,illegal
    call font_active
    jp nz,illegal
screen_partial:
    call save_text
    call screen_native
    bit 5,(ix+SCREEN_FLAGS)
    call nz,screen_interlace
    bit 6,(ix+SCREEN_FLAGS)
    call nz,screen_sprite_flags
    bit 7,(ix+SCREEN_FLAGS)
    call nz,screen_svns
    jp restore_text
screen_initialize:
    call save_text
    call font_off
    call pattern_off
    call wait_vdp
    ld a,1
    call write_mode21       ; V58互換モードへ戻し、フラットインターレースなどを解除する。
    xor a
    call write_mode20       ; BIOSのパレット書き込みは従来のバイト形式を使う。
    xor a
    ld (ACPAGE),a
    ld (DPPAGE),a
    ld (BAKCLR),a
    ld (BDRCLR),a
    ld a,15
    ld (FORCLR),a
    call screen_native
    xor a
    call write_mode20
    ld a,(ix+SCREEN_VALUES)
    or a
    jr z,screen_done
    call enable_v9968
    ld a,(RG8SAV)
    or 2                    ; SCREEN後のスプライトモード3は明示的な有効化を必要とする。
    ld (RG8SAV),a
    ld c,8
    call write_reg
screen_done:
    call screen_interlace
    call screen_sprite_flags
    call screen_svns
    jp restore_text

screen_validate_fil:
    ld a,(ix+SCREEN_VALUES)
    bit 0,(ix+SCREEN_FLAGS)
    jr nz,screen_fil_mode
    ld a,(SCRMOD)
screen_fil_mode:
    cp 5
    jr z,screen_fil_mode_ok
    cp 6
    jr z,screen_fil_mode_ok
    cp 7
    jr z,screen_fil_mode_ok
    cp 8
    jp nz,illegal
    bit 0,(ix+SCREEN_FLAGS)
    jr nz,screen_fil_mode_ok ; SCREEN 8の完全な初期化では標準のYJK設定が解除される。
    ld a,(RG25SAV)
    and 8
    jp nz,illegal
    ld a,8
screen_fil_mode_ok:
    bit 0,(ix+SCREEN_FLAGS)
    ret nz                  ; 完全な初期化では互換性のない機能を解除する。
    ld c,8
    cp 7
    jr c,screen_fil_pages   ; SCREEN 5/6には標準の32KBページが8枚ある。
    ld c,4
screen_fil_pages:
    ld a,(DPPAGE)
    cp c
    jp nc,illegal
    bit 0,a
    jp nz,illegal
    ld a,(ACPAGE)
    cp c
    jp nc,illegal
    bit 0,a
    jp nz,illegal
    ld a,(RG21SAV)
    bit 0,a
    jp nz,illegal
    ld a,(RG20SAV)
    bit 3,a
    jp nz,illegal
    call font_active
    jp nz,illegal
    ret

screen_interlace:
    ld b,0
    ld a,(ix+SCREEN_VALUES+5)
    cp 4
    jr nz,screen_fil_write
    ld b,$40
screen_fil_write:
    ld a,(RG21SAV)
    and $bf
    or b
    ld (RG21SAV),a
    ld c,21
    jp write_reg

screen_svns:
    ld a,(ix+SCREEN_VALUES+7)
    add a,a                 ; 第8引数をR#20のSVNS（ビット1）へ変換する。
    ld b,a
    ld a,(RG20SAV)
    and $fd                 ; ILNSと、それ以外の表示設定をすべて保持する。
    or b
    jp write_mode20

; 検証済みの定数だけを渡し、ユーザーの式は二度評価しない。
; SUB-ROMのSCREEN入口では、HL/AにSCREEN自身ではなく引数の先頭トークンの位置/値を渡す。
screen_native:
    ld a,(ix+SCREEN_FLAGS)
    and $3f
    ret z                   ; スプライトフラグだけの指定では標準の解析処理を呼ばない。
    call wait_vdp
    push ix
    pop hl
    ld d,h
    ld e,l
    ld bc,SCREEN_TEXT
    add hl,bc
    ld c,(ix+SCREEN_FLAGS)
    ld b,6
screen_native_arg:
    srl c
    jr nc,screen_native_omit
    ld (hl),$0f             ; 標準BASICの符号なしバイト定数トークン。
    inc hl
    ld a,b
    cp 1
    ld a,(de)
    jr nz,screen_native_value
    and 3                   ; I=4は標準側へI=0として渡し、FILは別途設定する。
screen_native_value:
    ld (hl),a
    inc hl
    ld (ix+SCREEN_END),l
    ld (ix+SCREEN_END+1),h
screen_native_omit:
    ld (hl),','
    inc hl
    inc de
    djnz screen_native_arg
    ld l,(ix+SCREEN_END)
    ld h,(ix+SCREEN_END+1)
    ld (hl),0               ; 標準側へ渡すトークン列には末尾の省略項目を含めない。
    push ix
    pop hl
    ld de,SCREEN_TEXT
    add hl,de
    ld a,(hl)
    or a
    push ix
    ld ix,SUB_SCREEN
    call EXTROM
    pop ix
    ret

screen_sprite_flags:
    ld a,(ix+SCREEN_VALUES+6)
    and 2
    rrca
    rrca                    ; 引数のビット1をR#20のS16（ビット7）へ変換する。
    ld b,a
    ld a,(RG20SAV)
    and $7f
    or b
    call write_mode20
    ld a,(ix+SCREEN_VALUES+6)
    and 1
    rrca
    ld b,a
    ld a,(RG25SAV)
    and $7f
    or b
    ld (RG25SAV),a
    ld c,25
    jp write_reg

cmd_page:
    call open_args
    call get_page
    ld (ix+DPAGE),a
    call comma
    call get_page
    ld (ix+SPAGE),a
    call close_args
    call end_statement
    call require_graphics
    call wait_vdp
    ld a,(ix+SPAGE)
    ld (ACPAGE),a
    ld a,(ix+DPAGE)
    ld (DPPAGE),a
    rrca
    rrca
    rrca
    or $1f
    ld (RG2SAV),a
    ld c,2
    jp write_reg

cmd_palette:
    call open_args
    call get_byte
    ld (ix+TEMP),a
    call comma
    call get_component
    ld (ix+SX1),a
    call comma
    call get_component
    ld (ix+SY1),a
    call comma
    call get_component
    ld (ix+SX2),a
    call close_args
    call end_statement
    call require_palette
    di
    ld a,(ix+TEMP)
    out ($99),a
    ld a,$90
    out ($99),a
    ld a,(ix+SX1)
    out ($9a),a
    ld a,(ix+SY1)
    out ($9a),a
    ld a,(ix+SX2)
    out ($9a),a
    ei
    ret
get_component:
    call get_byte
    cp 32
    jp nc,illegal
    ret

; コマンド以外のレジスタを先に設定する。実行を開始するR#46は最後に書き込む。
submit_command:
    call wait_vdp
    push hl
    push ix
    pop hl
    di
    ld a,32
    out ($99),a
    ld a,$91
    out ($99),a
    ld c,$9b
    ld b,14
    otir
    inc hl
    ld a,47
    out ($99),a
    ld a,$91
    out ($99),a
    ld b,12
    otir
    ld a,(ix+14)
    out ($99),a
    ld a,$ae
    out ($99),a
    ei
    pop hl
    ret
