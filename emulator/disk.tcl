set save_settings_on_exit false
if {![info exists ::env(V9968_VISUAL)] || $::env(V9968_VISUAL) ne "0"} {
    set throttle on
    set fastforward off
    set renderer SDLGL-PP
    set scale_factor 3
}
if {![llength [info commands diska]]} {
    error "This machine has no disk drive. Select Panasonic_FS-A1ST(V9968)."
}
# These settings must precede insertion; they do not change an inserted disk.
set DirAsDSKmode read_only
set bootsector DOS2
diska $::env(V9968_DISK)
# Disk BASIC loads AUTOEXEC.BAS itself. No BASIC text is typed by the host.
