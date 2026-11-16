# where-was-i

A small strip above the message box in Claude Code that answers one question when you click into a session: **where was I?**

- **Line 1** is the folder the session is working in, and the branch if there is one. A session with no project folder says `No folder`.
- **Last** is what just happened, in plain words.
- **Next** is what is waiting, or who has to act.

<img width="772" height="196" alt="image" src="https://github.com/user-attachments/assets/3ee51a97-b5c4-4b24-8cf3-c54e3d942fd5" />

It is made for people who direct Claude to build things. No setup, no settings, nothing to learn.

## Install

You need Claude Code 2.1.275 or later.

Type this in a Claude Code session:

```
Install this claude mod: https://github.com/mabera96/where-was-i?tab=readme-ov-file
```

At the prompt of a Claude Code session in a terminal:

```
/plugin install where-was-i --marketplace mabera96/where-was-i
```

Answer `y` to add the marketplace, then press Enter to install it for your account.

From a shell:

```
claude plugin install where-was-i --marketplace mabera96/where-was-i
```

In the Claude desktop app, where `/plugin` does not run: click **+** next to the message box, then **Plugins**, **Add marketplace** with `mabera96/where-was-i`, then **Add plugin**.

Once installed, the strip shows in every session you start, including in the desktop app.

## What you should know before installing

- **It uses a little of your Claude usage.** After each turn, the mod asks a small, fast model (Haiku) to write the two summary lines. That call counts toward your own usage like anything else you do in Claude Code.
- **It reads the end of your conversation.** To write the summary it takes your last message and Claude's last reply. They are sent only to Claude, through your own account. Nothing goes anywhere else.
- **It runs one git command** (`git rev-parse`) in the session's folder to read the branch name. It changes nothing.
- **It saves the last summary for each session** on your computer, so reopening a session does not cost another model call.
- **The Open button asks your computer to open a `claude://` link**, which is how the desktop app switches to another chat. To build that link, the mod reads the chat's id from a setting the desktop app provides.
- **Chats share one small saved file** on your computer: each chat's summary, folder and branch, and whether the panel is open. Nothing in it leaves your computer.

## How it behaves

- The summary is rewritten each time Claude finishes a turn. Helper agents finishing do not count.
- If the summary cannot be written, `Last:` shows the first line of Claude's last reply. The strip never shows an error.
- If the folder is not under version control, the branch is simply not shown.
- A brand-new session shows the folder line only.

## See all your chats: `/where`

Type `/where` in any chat to open a side panel listing your recent chats, newest first. Each one shows its folder, branch, how long ago it was active, and what happened and what is next there.

- **Open** takes you to that chat. This works in the Claude desktop app. It was built and tested on a Mac; on Windows it is untested.
- **Hide** takes a chat off the list. It does not delete the chat. If you use that chat again, it comes back.
- The chat you are in is shaded blue.
- **The panel follows you.** Once it is open, it opens in your other open chats too, and closing it anywhere closes it everywhere.

Three things to know:

- A chat appears in the panel after its next reply with this version installed. The list fills in as you use your chats.
- The strip and the panel only show in a chat that is awake. If you click into a chat that has been idle and see neither, they appear once you send a message.
- A chat that was already open when you installed or updated the mod needs `/reload-plugins` once.

The first time the mod loads, the strip shows a short welcome with these commands. Press **Got it** and it never shows again.

## Change the color

The folder name and the two labels in the strip are a burnt yellow. To change it, edit the `YELLOW` value in `hooks/register.tsx`, then run `/reload-plugins`. The panel's colors are next to it: `HERE` is the shade of the chat you are in, and `STRIPE` is the alternating band.

## Remove it

```
claude plugin uninstall where-was-i@where-was-i
```

## License

MIT
