# Pi Session Explorer

Browse the records in the current Pi session file and view each record in your external editor. The explorer includes the session header, messages, tool results, settings changes, and other JSONL records. It does not change the active conversation or the session file.

## Install

Set `EDITOR` to a terminal editor before starting Pi, then load this package:

```sh
export EDITOR=vim
pi -e ./pi-session-explorer
```

You can also run `pi install ./pi-session-explorer` from the directory that contains this repository. Reload Pi after installing in a running session.

Run `/turns`. The picker shows a short preview of the message, command, output, or thinking text for each record. Type the start of a record type to filter the list, then use the arrow keys to select a record. Enter opens a Markdown view with metadata in front matter and the content below it. Ctrl+R opens the same record as raw JSON. Escape clears the filter or leaves the picker. Close your editor to return to the list. Records are shown in file order, with their original line numbers. When a JSONL line contains a transaction array, each item has its own picker entry. Editor files are saved in a directory named after the session file under `/tmp/pi-session-explorer` (or the system temporary directory). A file such as `turn-0006--toolcall.md` uses the JSONL line number and record type; transaction items also include their item number. Saved files remain after the editor closes, and reopening a record preserves edits to its file. Use Ctrl+R to save or open a separate raw JSON file.

Run `/last-turn` to open the latest assistant message directly in the same Markdown file used by `/turns`. It uses the last assistant record in file order, including records inside transaction arrays. If there is no assistant message, Pi shows a notice instead.

`EDITOR` can include arguments. For a graphical editor, configure it to wait until you close the file, for example `EDITOR='code --wait'`. This feature needs an interactive terminal and a session saved to a JSONL file. Your editor command runs through the shell, so only use a command you trust.

## Develop

```sh
pnpm install --ignore-scripts
pnpm exec tsc --noEmit
pnpm test
```
