# Pi Session Explorer

Browse the records in the current Pi session file and view each record in your external editor. The explorer includes the session header, messages, tool results, settings changes, and other JSONL records. It does not change the active conversation or the session file.

## Install

Set `EDITOR` to a terminal editor before starting Pi, then load this package:

```sh
export EDITOR=vim
pi -e ./pi-session-explorer
```

You can also run `pi install ./pi-session-explorer` from the directory that contains this repository. Reload Pi after installing in a running session.

Run `/session-explorer`. The picker shows a short preview of the message, command, output, or thinking text for each record. Type the start of a record type to filter the list, then use the arrow keys to select a record. Enter opens a Markdown view with metadata in front matter and the content below it. Ctrl+R opens the same record as raw JSON. Escape clears the filter or leaves the picker. Close your editor to return to the list. Records are shown in file order, with their original line numbers. When a JSONL line contains a transaction array, each item has its own picker entry. Any edits to the temporary files are discarded when the editor exits.

`EDITOR` can include arguments. For a graphical editor, configure it to wait until you close the file, for example `EDITOR='code --wait'`. This feature needs an interactive terminal and a session saved to a JSONL file. Your editor command runs through the shell, so only use a command you trust.

## Develop

```sh
pnpm install --ignore-scripts
pnpm exec tsc --noEmit
pnpm test
```
