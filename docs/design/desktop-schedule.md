# Desktop Schedule

The desktop Schedule surface presents recurring agent tasks and their run
history. Its current data source is a renderer fixture while the daemon
scheduler contract is being designed; the renderer must eventually consume a
protocol-neutral daemon snapshot and events rather than provider-specific data.

## Sleep and shutdown behavior

Local schedules only run while the machine is awake and the desktop runtime is
available. A schedule that falls due while the machine is asleep or the app is
closed is not replayed after wake. The corresponding occurrence is recorded as
`missed` so the history remains explicit without unexpectedly starting stale
work.
