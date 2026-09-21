set save_settings_on_exit false
set sound_driver null
if {$::env(V9968_VISUAL) eq "0"} {
    set renderer none
    set throttle off
} else {
    set renderer SDLGL-PP
    set throttle on
}

proc bridge_poll {} {
    set directory $::env(V9968_IPC_DIRECTORY)
    set request [file join $directory request]
    if {[file exists $request]} {
        set input [open $request r]
        set script [binary format H* [read $input]]
        close $input
        file delete $request
        set code [catch {uplevel #0 $script} result]
        set output [open [file join $directory reply.tmp] w]
        puts $output "$code\n[binary encode hex [encoding convertto utf-8 $result]]"
        close $output
        file rename -force [file join $directory reply.tmp] [file join $directory reply]
    }
    after realtime 0.01 bridge_poll
}
set output [open [file join $::env(V9968_IPC_DIRECTORY) ready] w]
close $output
after realtime 0.01 bridge_poll
