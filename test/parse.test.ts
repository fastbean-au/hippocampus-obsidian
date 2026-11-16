import assert from "node:assert/strict";
import { test } from "node:test";

import { create } from "@bufbuild/protobuf";
import { Bool, GetMemoriesResponseSchema, MemorySchema } from "hippocampus-client";

import { memoryViewsFrom, toMemoryView } from "../src/parse";

test("toMemoryView narrows bigint times and the tri-state to plain values", () => {
	const view = toMemoryView(
		create(MemorySchema, {
			id: "3125f947",
			timeStamp: 1784927608547449000n,
			significance: 8,
			body: "second memory",
			isBinary: Bool.FALSE,
			timeRecalled: 1784927608642142000n,
			recallCount: 1,
			group: "daily",
		}),
	);

	assert.equal(view.id, "3125f947");
	assert.equal(view.timeStamp, 1784927608547449000);
	assert.equal(view.timeRecalled, 1784927608642142000);
	assert.equal(view.significance, 8);
	assert.equal(view.group, "daily");
	assert.equal(view.recallCount, 1);
	assert.equal(view.isBinary, false);
	assert.equal(view.isSummary, false);
});

test("toMemoryView treats only TRUE as binary", () => {
	assert.equal(toMemoryView(create(MemorySchema, { isBinary: Bool.TRUE })).isBinary, true);
	assert.equal(toMemoryView(create(MemorySchema, { isBinary: Bool.UNSPECIFIED })).isBinary, false);
	assert.equal(toMemoryView(create(MemorySchema, {})).isBinary, false);
});

test("memoryViewsFrom maps every memory, and an empty page to nothing", () => {
	assert.deepEqual(memoryViewsFrom(create(GetMemoriesResponseSchema, {})), []);
	assert.equal(
		memoryViewsFrom(create(GetMemoriesResponseSchema, { memories: [{ id: "a", body: "x" }] })).length,
		1,
	);
});
