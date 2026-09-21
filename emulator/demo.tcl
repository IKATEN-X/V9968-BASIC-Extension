set save_settings_on_exit false
set throttle on
set fastforward off
set renderer SDLGL-PP
set scale_factor 3
proc load_orbit {} {
    set input [open $::env(V9968_DEMO) r]
    set program [read $input]
    close $input
    set program [string map [list "\r\n" "\n" "\n" "\r"] $program]
    type_via_keybuf "$program\rRUN\r"
}
after time 12 load_orbit
