// The projects (townships) the app can show. Only City of Elmina has data today: a new township is one more entry here, plus its
// own API (see docs/commercial-case.md, "What repeating it for another township needs"). Pure, no DOM.

export const PROJECTS = [
  { id: "elmina", name: "City of Elmina", kind: "Pilot township", api: null },
];

/** A project by id, or null. */
export const findProject = (id, list = PROJECTS) => list.find((p) => p.id === id) ?? null;

/** The project named in ?project=, or the first one when the name is missing or unknown. */
export function projectFromSearch(search, list = PROJECTS) {
  return findProject(new URLSearchParams(search).get("project"), list) ?? list[0];
}

/**
 * The query string that opens a project: its id (the first project needs none) and its own API address when it has one.
 * Other parameters are kept. js/api.js still refuses an API address that is not local or the page's own.
 */
export function projectSearch(project, search = "", list = PROJECTS) {
  const q = new URLSearchParams(search);
  q.delete("project");
  q.delete("api");
  if (project.id !== list[0].id) q.set("project", project.id);
  if (project.api) q.set("api", project.api);
  const text = q.toString();
  return text ? `?${text}` : "";
}
