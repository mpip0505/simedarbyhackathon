import { test } from "node:test";
import assert from "node:assert/strict";
import { PROJECTS, findProject, projectFromSearch, projectSearch } from "../js/projects.js";

const two = [{ id: "elmina", name: "City of Elmina", api: null }, { id: "demo", name: "Demo township", api: "http://localhost:8001" }];

test("Elmina is the project the app has, and the default", () => {
  assert.equal(PROJECTS[0].id, "elmina");
  assert.equal(projectFromSearch("").id, "elmina");
  assert.equal(projectFromSearch("?project=nowhere").id, "elmina");
});

test("a project is found by id, and an unknown id is not invented", () => {
  assert.equal(findProject("demo", two).name, "Demo township");
  assert.equal(findProject("x", two), null);
  assert.equal(findProject(null, two), null);
  assert.equal(projectFromSearch("?project=demo", two).id, "demo");
});

test("opening a project builds its query string and keeps the other parameters", () => {
  assert.equal(projectSearch(two[0], "", two), "");
  assert.equal(projectSearch(two[1], "", two), "?project=demo&api=http%3A%2F%2Flocalhost%3A8001");
  assert.equal(projectSearch(two[0], "?project=demo&api=http%3A%2F%2Flocalhost%3A8001&x=1", two), "?x=1");
});
