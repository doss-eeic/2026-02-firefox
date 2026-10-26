/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests expiration of bookmarks with an expireAt timestamp.
 */

const FOLDER_TITLE = "期限切れブックマーク";
const FOLDER_KEY = "bookmark_expiration_folder";

add_task(async function test_expired_bookmark_moved_to_folder() {
  let pastDate = new Date(Date.now() - 86400000);
  let futureDate = new Date(Date.now() + 86400000);
  let expired = await PlacesUtils.bookmarks.insert({
    url: "https://expired.mozilla.org/",
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    expireAt: pastDate,
  });
  let future = await PlacesUtils.bookmarks.insert({
    url: "https://future.mozilla.org/",
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    expireAt: futureDate,
  });
  let noExpiry = await PlacesUtils.bookmarks.insert({
    url: "https://noexpiry.mozilla.org/",
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
  });

  await promiseForceExpirationStep(-1);

  info("Check the expiration folder was created under the unfiled root");
  let folderGuid = await PlacesUtils.metadata.get(FOLDER_KEY, null);
  Assert.ok(folderGuid, "The expiration folder GUID was persisted");
  let folder = await PlacesUtils.bookmarks.fetch(folderGuid);
  Assert.equal(folder.title, FOLDER_TITLE, "The folder has the expected title");
  Assert.equal(
    folder.parentGuid,
    PlacesUtils.bookmarks.unfiledGuid,
    "The folder lives under the unfiled root"
  );

  info("Check the expired bookmark was moved");
  let expiredItem = await PlacesUtils.bookmarks.fetch(expired.guid);
  Assert.equal(
    expiredItem.parentGuid,
    folderGuid,
    "The expired bookmark was moved to the folder"
  );
  Assert.equal(
    expiredItem.expireAt.getTime(),
    pastDate.getTime(),
    "expireAt is preserved after the move"
  );

  info("Check the other bookmarks were not moved");
  let futureItem = await PlacesUtils.bookmarks.fetch(future.guid);
  Assert.equal(
    futureItem.parentGuid,
    PlacesUtils.bookmarks.unfiledGuid,
    "The future bookmark was not moved"
  );
  Assert.equal(
    futureItem.expireAt.getTime(),
    futureDate.getTime(),
    "The future bookmark kept its expireAt"
  );
  let noExpiryItem = await PlacesUtils.bookmarks.fetch(noExpiry.guid);
  Assert.equal(
    noExpiryItem.parentGuid,
    PlacesUtils.bookmarks.unfiledGuid,
    "The bookmark without expiration was not moved"
  );
  Assert.equal(noExpiryItem.expireAt, null, "The bookmark has no expireAt");
});

add_task(async function test_expired_bookmark_not_reselected() {
  let folderGuid = await PlacesUtils.metadata.get(FOLDER_KEY);
  let folder = await PlacesUtils.bookmarks.fetch(folderGuid);
  Assert.ok(folder.childCount, "The folder has children from the previous run");

  await promiseForceExpirationStep(-1);

  info("Bookmarks already in the folder must not be picked up again");
  folder = await PlacesUtils.bookmarks.fetch(folderGuid);
  Assert.equal(folder.childCount, 1, "The folder contents did not change");
  Assert.equal(
    await PlacesUtils.metadata.get(FOLDER_KEY),
    folderGuid,
    "No duplicate folder was created"
  );
});

add_task(async function test_expired_bookmark_in_subfolder() {
  let parent = await PlacesUtils.bookmarks.insert({
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    title: "nested",
  });
  let nested = await PlacesUtils.bookmarks.insert({
    url: "https://nested-expired.mozilla.org/",
    parentGuid: parent.guid,
    expireAt: new Date(Date.now() - 86400000),
  });

  await promiseForceExpirationStep(-1);

  let folderGuid = await PlacesUtils.metadata.get(FOLDER_KEY);
  let item = await PlacesUtils.bookmarks.fetch(nested.guid);
  Assert.equal(
    item.parentGuid,
    folderGuid,
    "The expired bookmark was moved out of its subfolder"
  );
});

add_task(async function test_folder_recreated_after_removal() {
  await PlacesUtils.bookmarks.eraseEverything();

  let expired = await PlacesUtils.bookmarks.insert({
    url: "https://recreated-expired.mozilla.org/",
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    expireAt: new Date(Date.now() - 86400000),
  });

  await promiseForceExpirationStep(-1);

  info("The stale metadata GUID must not prevent folder recreation");
  let folderGuid = await PlacesUtils.metadata.get(FOLDER_KEY);
  Assert.ok(folderGuid, "The folder GUID is available");
  let folder = await PlacesUtils.bookmarks.fetch(folderGuid);
  Assert.ok(folder, "The folder exists again");
  Assert.equal(folder.title, FOLDER_TITLE, "The folder has the expected title");
  let item = await PlacesUtils.bookmarks.fetch(expired.guid);
  Assert.equal(
    item.parentGuid,
    folderGuid,
    "The expired bookmark was moved to the recreated folder"
  );
});

add_task(async function test_expired_descendant_not_reselected() {
  let folderGuid = await PlacesUtils.metadata.get(FOLDER_KEY);
  let subfolder = await PlacesUtils.bookmarks.insert({
    type: PlacesUtils.bookmarks.TYPE_FOLDER,
    parentGuid: folderGuid,
    title: "organized",
  });
  let nestedExpired = await PlacesUtils.bookmarks.insert({
    url: "https://nested-in-trash.mozilla.org/",
    parentGuid: subfolder.guid,
    expireAt: new Date(Date.now() - 86400000),
  });
  let folderBefore = await PlacesUtils.bookmarks.fetch(folderGuid);
  let childCountBefore = folderBefore.childCount;

  await promiseForceExpirationStep(-1);

  let item = await PlacesUtils.bookmarks.fetch(nestedExpired.guid);
  Assert.equal(
    item.parentGuid,
    subfolder.guid,
    "An expired bookmark inside a subfolder of the expiration folder was not moved"
  );
  let folderAfter = await PlacesUtils.bookmarks.fetch(folderGuid);
  Assert.equal(
    folderAfter.childCount,
    childCountBefore,
    "The expiration folder direct children did not change"
  );
});

add_task(async function test_extended_expiry_not_moved_during_processing() {
  await PlacesUtils.bookmarks.eraseEverything();

  let expired = await PlacesUtils.bookmarks.insert({
    url: "https://extended.mozilla.org/",
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    expireAt: new Date(Date.now() - 86400000),
  });

  let originalSet = PlacesUtils.metadata.set;
  PlacesUtils.metadata.set = async (key, value) => {
    let result = await originalSet.call(PlacesUtils.metadata, key, value);
    if (key == FOLDER_KEY) {
      await PlacesUtils.bookmarks.update({
        guid: expired.guid,
        expireAt: new Date(Date.now() + 86400000),
      });
    }
    return result;
  };
  try {
    await promiseForceExpirationStep(-1);
  } finally {
    PlacesUtils.metadata.set = originalSet;
  }

  let item = await PlacesUtils.bookmarks.fetch(expired.guid);
  Assert.equal(
    item.parentGuid,
    PlacesUtils.bookmarks.unfiledGuid,
    "The bookmark was not moved after its expiry was extended mid-flight"
  );
});

add_task(async function cleanup() {
  await PlacesUtils.bookmarks.eraseEverything();
  await PlacesUtils.history.clear();
});

add_setup(async function () {
  // Set a large interval so the timer does not interfere with the tests.
  setInterval(3600);
});
