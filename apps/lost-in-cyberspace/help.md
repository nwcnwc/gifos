# Lost in Cyberspace

A two-player co-op. One of you is lost in an 8×8 corporate network. The other sits at a terminal and draws the map. The only thing that ties the two seats together is **access codes** — four hex strings the hacker reads from terminals. Type them into `nmap` **together** and the maze appears.

You have **4 minutes 16 seconds** (256 seconds) before the locator finds the hacker. A **trap** node takes 32 seconds. **Hacking a wrong node** takes 16. Hack the **TARGET** and you win. Time out and you are lost.

## Two seats

**HACKER** — you walk the maze. Each node is a room. Doors lead to neighbouring nodes. The floor colour is the sector. Four sectors, four codes.

- **Computer:** arrow keys or **WASD** to turn, **Space** or click the door to walk. **Down / S** turns you around. **H** help. **G** hack.
- **Phone:** the D-pad turns and walks. Tap the left or right of the room to turn, the centre to walk, the floor to turn around. **HELP** and **HACK** sit under the room.

**HELP** tells you what the codes are for. The access code for this sector sits on the terminal. **HACK** the TARGET to win. Hacking anything else just makes you easier to find.

**NAVIGATOR** — a green terminal. Type commands, press Enter.

- `help` — the list. `help nmap` for the map command.
- `nmap 0xC16F8 0xD1234 …` — up to four access codes **in one command**. Each one fills in a different layer: sectors, connections, traps, target. One code is one layer; all four is the maze.
- `top` — the high-score list. After a win the hacker gets a score code; `top 0x…… TEAM` adds it.
- `cat` and `make-me-a-sandwich` are jokes. `sudo make-me-a-sandwich` is the one that works.

Codes are case-insensitive. The `0x` prefix is optional.

## Play on this device

Pick a seat. **Navigator** / **Hacker** in the bar switches without resetting the maze. Codes you have already read from a terminal are waiting on the navigator as chips — tap **Map all**.

## Play with a friend

Press **Play with a friend**, then **Invite** in the bar above the app.

One of you taps **I am the HACKER**, the other **I am the NAVIGATOR**. The hacker generates the maze. You can still shout the codes if you are in a meeting. The hacker can also press **Send code** to put every code they choose onto the navigator’s terminal — the map updates with **all** of them, not one layer at a time.

You need both seats.

## What is saved

Top scores live in this file on this device. An unfinished maze is not kept. Close it and the locator resets.

Unofficial port of [Lost in CYBERSPACE](https://github.com/bartaz/lost-in-cyberspace) by Bartek Szopka and Zofia Korcz. js13kGames 2017. The original VR headset scene used A-Frame from a CDN; this copy walks the same maze on a canvas so it fits in a GIF.
