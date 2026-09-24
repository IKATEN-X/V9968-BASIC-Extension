; LFMCのCPUデータ待ちを比較する検証本体。拡張BASIC ROMは使用しない。
; 単体起動ROMではなく、画面初期化と下記パラメータの設定を呼出し側で行う。
; 自動実行: node tests/lfmc-transfer.mjs --quick
; Z80で実行: node tests/lfmc-transfer.mjs V9968_Basic --quick
;
; 使用領域はBASICのCLEAR 200,&HBFFFで予約する。C100hへロードして使用。
; アセンブル例 (z88dk-z80asm):
;   z88dk-z80asm -b -o=lfmc-transfer.bin tests/lfmc-transfer.asm
; 出力はC100hへ配置する生バイナリ。BLOAD用ヘッダは含まない。
;
; SCREEN 7で16x1ドットを描く再現手順:
; 1. SCREEN 7 / 通常表示 / ページ0を色9で塗り、先行コマンドを完了させる。
;    現行V9968でR#21.V58=0、R#20.HS=0または1にする。
;    BASICではVDP(22)=VDP(22) AND 254、VDP(21)=0または1。
; 2. 次の値をRAMへ設定する (アドレスと値は16進数):
;    C007: 03                         ; LFMC背景色 (R#12)
;    C008: 02 00                      ; 転送バイト数 (リトルエンディアン)
;    C00A: 00                         ; 00=直接 / 01=間接ポート
;    C00B: 00                         ; 待機モード (下記)
;    C020: 00 00 00 00 40 00 40 00   ; R#32..39: SX=SY=0、DX=DY=64
;    C028: 10 00 01 00 05 00 20      ; R#40..46: NX=16、NY=1、色5、PSET/LFMC
;    C800: F0 0F                      ; 8ドット/バイト、MSBから描画
; 3. CALL C10Chで開始と転送を同じDI区間で実行する。
;    C00B=00: 待機なし。01: 最初の転送前。02: 1バイト目と2バイト目の間。
;    各送信前にS#2.TR=1とCE=1を確認する。
; 4. 呼出し側で少なくとも20ms経過させ、CALL C106hでS#2を採取する。
;    C010のbit0=CE、bit7=TR。C00C=0、C012..13=0002なら2バイト送信済み。
;    結果を退避してからCALL C109hで中止する (この呼出しもC010を更新する)。
;    POINTなど完了待ちを含む命令で画素を調べるのは、中止した後に行う。
;
; 期待値: (64,64)から右へ、55553333 33335555、CE=0。
; openMSX c620b69での観測 (Z80/R800、HS=0/1、直接/間接で一致):
;    C00B=00: 55553333 33335555 / CE=0
;    C00B=01: 99999999 99999999 / CE=1
;    C00B=02: 55553333 99999999 / CE=1
; 実機/FPGAでの同条件の動作は未確認。仕様か実装不具合かを調べるための資料。
;
; ポートは内蔵VDPの98h系。外付けカートリッジへそのまま転用しないこと。
; 入口では割り込み許可状態を前提とし、内部でDI、R#15=0へ復帰してEI/RETする。
; レジスタ保存や画面/色の復旧は呼出し側の責任。各ポーリングには上限がある。
; C00Cのエラー: 0=なし、1=TR待ち時間切れ、2=転送途中にCE=0、3=VR待ち時間切れ。
;
; C100h:開始 C103h:転送 C106h:S#2取得 C109h:中止 C10Ch:開始直後に転送。
; C008h:転送数 C00Ah:0=直接/1=間接 C00Ch:エラー C010h:S#2
; C00Bh:0=待機なし/1=最初の転送前/2=転送途中に1フレーム待機。
; C011h:転送直前S#2 C012h:転送済み数 C020h:R#32..46 C800h:データ。
    org $c100
    jp start
    jp send
    jp sample
    jp abort
    jp immediate

start:
    di
    call start_inner
    jr sample_inner
immediate:
    di
    call start_inner
    jr send_inner
send:
    di
send_inner:
    xor a
    ld ($c00c),a
    ld ($c012),a
    ld ($c013),a
    ld hl,$c800
    ld de,($c008)
    ld a,($c00b)
    cp 1
    jr nz,send_next
    call wait_frame
    jr c,frame_error
send_next:
    ld a,d
    or e
    jr z,sample_inner
    push de
    ld de,$ffff
wait_tr:
    call status2
    ld ($c011),a
    bit 0,a
    jr z,ended_early
    bit 7,a
    jr nz,ready
    dec de
    ld a,d
    or e
    jr nz,wait_tr
    ld a,1
    jr send_error
ended_early:
    ld a,2
send_error:
    ld ($c00c),a
    pop de
    jr sample_inner
ready:
    pop de
    ld a,($c00a)
    or a
    ld a,(hl)
    jr nz,indirect
    ld c,44
    call write_reg
    jr sent
indirect:
    out ($9b),a
sent:
    inc hl
    dec de
    ld bc,($c012)
    inc bc
    ld ($c012),bc
    ld a,d
    or e
    jr z,sample_inner
    ld a,($c00b)
    cp 2
    jr nz,send_next
    call wait_frame
    jr nc,send_next
frame_error:
    ld a,3
    ld ($c00c),a

sample:
    di
sample_inner:
    call status2
    ld ($c010),a
    xor a
    ld c,15
    call write_reg
    ei
    ret
abort:
    di
    xor a
    ld c,46
    call write_reg
    jr sample_inner
start_inner:
    ld c,12
    ld a,($c007)
    call write_reg
    ld c,17
    ld a,32
    call write_reg
    ld hl,$c020
    ld bc,$0f9b
    otir
    ; 間接転送はR#44に固定し、途中で別レジスタへ進まないようにする。
    ld a,$ac
    ld c,17
    jp write_reg
; DIのままVRの0->1->0を待つ。ホストとの往復なしでフレームをまたぐ。
; 各待機に上限を設け、VDPの応答がなくてもBASICへ戻れるようにする。
wait_frame:
    push bc
    push de
    ld b,0
    call wait_vr
    jr c,frame_done
    ld b,$40
    call wait_vr
    jr c,frame_done
    ld b,0
    call wait_vr
frame_done:
    pop de
    pop bc
    ret
wait_vr:
    ld de,$ffff
wait_vr_loop:
    call status2
    and $40
    cp b
    ret z
    dec de
    ld a,d
    or e
    jr nz,wait_vr_loop
    scf
    ret
status2:
    ld a,2
    ld c,15
    call write_reg
    in a,($99)
    ret
write_reg:
    out ($99),a
    ld a,c
    or $80
    out ($99),a
    ret
