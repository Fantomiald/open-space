# Mods and dashboards

[Français](mods.fr.md) · [Guide index](README.md)

A mod is a small floating window in Open Space, written by one of your agents: your Claude costs this week, a pomodoro timer, the sessions waiting for you. A dashboard lays several mods out on a grid.

## Making a mod

1. Click the **Mods** button.
2. Under **New mod**, describe the mod you want, then **Create**.
3. An agent writes it in a session. While it works, the window shows "Being built…" and **Show the session** opens that session. The window fills in once the agent is done.

An agent can also make a mod through the [MCP server](mcp.md) (`create_mod`).

## Managing a mod

In the Mods panel, each mod has:

- **Edit**: opens the session that writes it, to ask for a change.
- **Settings**: its name, description, icon, how often it refreshes by itself, and its environment variables.
- **Delete**: moves its folder to the Trash, after **Confirm**.

A mod's window has a ↻ button. It reloads the page, or, when the mod is tied to a trigger, runs that trigger again and then reloads. Refreshing by itself (never, or every 1, 5, 15, 30 or 60 minutes) only reloads, and only while the window is open and unfolded.

When a file in a mod's `data/` folder changes while its window is closed, Open Space shows a "!" on the Mods button.

## Variables

A mod's page can need a key or a setting, such as an API key. You fill these in the mod's **Settings**, under **Environment variables**. Open Space keeps them in `mods-env.json` under `OFFICE_DIR`, outside the mod's folder: the agent that writes the mod never sees their values, and only the mod's page gets them.

## A mod that starts a trigger

A mod can name one of your triggers. Its page then asks to start it, and Open Space asks you each time ("Start ...?") before it runs.

## Dashboards

A dashboard is a grid of your mods. Make one with **New dashboard**, then **Add a mod**. Drag a mod by its title to move it, pull its corner to resize it. **Take off** removes a mod from the dashboard. Deleting a dashboard keeps its mods.

## Where mods live

Each mod is a folder under `OFFICE_DIR/mods`, with a `mod.json` and an `index.html`. Open Space serves the pages on their own port (`OFFICE_MODS_PORT`, see [Settings](settings.md)), each mod under its own `<id>.localhost` address.

## Writing a mod by hand

The rules an agent follows to write a mod are in [`public/mod-kit/GUIDE.md`](../../public/mod-kit/GUIDE.md), in French. Open Space copies that file as the `CLAUDE.md` of the mods folder, so every session writing a mod reads it.
