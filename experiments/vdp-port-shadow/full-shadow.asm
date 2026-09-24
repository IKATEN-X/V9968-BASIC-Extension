; BIOSとBASICの32KBをRAMへ移す独立検証。未使用セグメント4・5を使う。
    defc FULL_SHADOW = 1
    include "probe.asm"
