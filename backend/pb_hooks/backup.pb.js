cronAdd("daily_backup", "0 2 * * *", () => {
  var stamp = new DateTime().string().replace(/[^0-9]/g, "").slice(0, 14);
  var name = "itsm_" + stamp + ".zip";

  try {
    $app.createBackup(new Context(), name);
    console.log("Created backup", name);
  } catch (err) {
    console.log("Backup failed", err);
  }
});
