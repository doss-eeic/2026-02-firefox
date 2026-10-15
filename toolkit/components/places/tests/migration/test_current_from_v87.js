/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function setup() {
  let path = await setupPlacesDatabase("places_v87.sqlite");

  let db = await Sqlite.openConnection({ path });

  Assert.equal(
    await db.getSchemaVersion(),
    87,
    "The fixture should be at schema version 87"
  );

  let columns = await db.execute(
    "SELECT name FROM pragma_table_info('moz_bookmarks')"
  );
  let columnNames = columns.map(r => r.getResultByName("name"));
  Assert.ok(
    !columnNames.includes("expireAt"),
    "expireAt should not exist on moz_bookmarks before migration"
  );

  await db.close();
});

add_task(async function database_is_valid() {
  // Accessing the database for the first time triggers migration.
  Assert.equal(
    PlacesUtils.history.databaseStatus,
    PlacesUtils.history.DATABASE_STATUS_UPGRADED
  );

  const db = await PlacesUtils.promiseDBConnection();
  Assert.equal(await db.getSchemaVersion(), CURRENT_SCHEMA_VERSION);

  let columns = await db.execute(
    "SELECT name FROM pragma_table_info('moz_bookmarks')"
  );
  let columnNames = columns.map(r => r.getResultByName("name"));
  Assert.ok(
    columnNames.includes("expireAt"),
    "expireAt column should exist on moz_bookmarks after migration"
  );

  let rows = await db.execute(
    "SELECT count(*), count(expireAt) FROM moz_bookmarks"
  );
  Assert.greater(
    rows[0].getResultByName("count(*)"),
    0,
    "Bookmarks should survive the migration"
  );
  Assert.equal(
    rows[0].getResultByName("count(expireAt)"),
    0,
    "expireAt should default to NULL for existing bookmarks"
  );
});
