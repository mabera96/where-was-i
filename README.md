# where-was-i

A small strip above the message box in Claude Code that answers one question when you click into a session: **where was I?**

```
my-shop-site · branch: new-checkout
Last: The checkout page now remembers the cart after a refresh. Tests pass.
Next: You try a test purchase, then decide whether to put it live.
```

- **Line 1** is the folder the session is working in, and the branch if there is one. A session with no project folder says `No folder`.
- **Last** is what just happened, in plain words.
- **Next** is what is waiting, or who has to act.

It is made for people who direct Claude to build things and never took a software class. No setup, no settings, nothing to learn.

## Install

You need Claude Code 2.1.275 or later.

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

## How it behaves

- The summary is rewritten each time Claude finishes a turn. Helper agents finishing do not count.
- If the summary cannot be written, `Last:` shows the first line of Claude's last reply. The strip never shows an error.
- If the folder is not under version control, the branch is simply not shown.
- A brand-new session shows the folder line only.

## Change the color

The folder name and the two labels are a burnt yellow. To change it, edit the `YELLOW` value near the top of `hooks/register.tsx`, then run `/reload-plugins`.

## Remove it

```
claude plugin uninstall where-was-i@where-was-i
```

## License

MIT
