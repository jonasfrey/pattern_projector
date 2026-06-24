/** Person management endpoints: create/update, list, get, delete. */

import { error, json, ok, readJson } from "../http.ts";
import {
  deletePerson,
  getPerson,
  listPersons,
  savePerson,
  type PersonInput,
} from "../../storage/persons.ts";

/** POST /api/person — create a person */
export async function createPersonHandler(req: Request): Promise<Response> {
  const body = await readJson<PersonInput>(req);
  if (!body.name || !body.name.trim()) return error("Name is required");
  const person = await savePerson({ ...body, id: undefined });
  return json(person, 201);
}

/** GET /api/person/list */
export function listPersonsHandler(): Response {
  return json(listPersons());
}

/** GET /api/person/:id */
export function getPersonHandler(id: string): Response {
  const p = getPerson(id);
  return p ? json(p) : error("Person not found", 404);
}

/** PUT /api/person/:id — update name/measurements/notes */
export async function updatePersonHandler(
  id: string,
  req: Request,
): Promise<Response> {
  const existing = getPerson(id);
  if (!existing) return error("Person not found", 404);
  const body = await readJson<PersonInput>(req);
  if (!body.name || !body.name.trim()) return error("Name is required");
  const person = await savePerson({ ...body, id });
  return json(person);
}

/** DELETE /api/person/:id */
export async function deletePersonHandler(id: string): Promise<Response> {
  const removed = await deletePerson(id);
  return removed ? ok() : error("Person not found", 404);
}
