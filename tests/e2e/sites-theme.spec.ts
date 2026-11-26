import { expect, test } from "@playwright/test";
import { forceClose, launch, pageAt, serve, visit } from "./helpers";

test("web pages get the light or dark mode chosen for sites, apart from Zak’s theme", async () => {
  const { server, origin } = await serve((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("<title>scheme</title><p>Hello</p>");
  });
  const { app, chrome } = await launch("sites-theme", undefined, {}, null);
  try {
    const dark = (page: Awaited<ReturnType<typeof pageAt>>): Promise<boolean> =>
      page.evaluate(() => matchMedia("(prefers-color-scheme: dark)").matches);
    // Settings in the first tab, the web page in a second one.
    await visit(chrome, "zak://settings");
    const settings = await pageAt(app, "zak://settings");
    const sites = (choice: string): Promise<void> =>
      settings
        .getByRole("radiogroup", { name: "Apparence des sites" })
        .getByRole("radio", { name: choice })
        .click();

    // Zak in « Clair » (its default), sites in « Sombre »: the page is dark, Zak's pages stay light.
    await sites("Sombre");
    await chrome.getByTestId("new-tab").click();
    await visit(chrome, `${origin}/`);
    const page = await pageAt(app, origin);
    await expect.poll(() => dark(page)).toBe(true);
    await expect.poll(() => dark(settings)).toBe(false);

    // Back to « Clair »: the open page switches at once.
    await chrome.getByTestId("tab").first().click();
    await sites("Clair");
    await expect.poll(() => dark(page)).toBe(false);
  } finally {
    await forceClose(app);
    server.close();
  }
});
