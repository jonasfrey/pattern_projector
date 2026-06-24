/** Person storage: name + body measurements, persisted as a single JSON index
 * (mirrors the pattern index in files.ts — these are small flat records with
 * no associated binary file). */

import { config } from "../server/config.ts";
import { logger } from "../utils/logger.ts";

export interface PersonMeasurements {
  height?: number; // cm
  chest?: number; // cm
  waist?: number; // cm
  hip?: number; // cm
  inseam?: number; // cm
  shoulder?: number; // cm
  sleeve?: number; // cm
}

export interface Person {
  id: string;
  name: string;
  measurements: PersonMeasurements;
  notes: string;
  created: string;
  modified: string;
}

const INDEX_FILE = `${config.storagePath}/persons.json`;
const MEASUREMENT_KEYS: (keyof PersonMeasurements)[] = [
  "height",
  "chest",
  "waist",
  "hip",
  "inseam",
  "shoulder",
  "sleeve",
];

let persons: Record<string, Person> = {};

async function persistIndex() {
  await Deno.writeTextFile(INDEX_FILE, JSON.stringify(persons, null, 2));
}

export async function initPersonsStorage() {
  await Deno.mkdir(config.storagePath, { recursive: true });
  try {
    const raw = await Deno.readTextFile(INDEX_FILE);
    persons = JSON.parse(raw);
    logger.debug(`Loaded person index (${Object.keys(persons).length} people)`);
  } catch {
    persons = {};
    await persistIndex();
  }
}

function makeId(): string {
  return `person_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeMeasurements(value: unknown): PersonMeasurements {
  const out: PersonMeasurements = {};
  if (!value || typeof value !== "object") return out;
  const o = value as Record<string, unknown>;
  for (const key of MEASUREMENT_KEYS) {
    if (typeof o[key] === "number" && o[key] as number >= 0) out[key] = o[key] as number;
  }
  return out;
}

export function listPersons(): Person[] {
  return Object.values(persons).sort((a, b) => a.name.localeCompare(b.name));
}

export function getPerson(id: string): Person | undefined {
  return persons[id];
}

export interface PersonInput {
  id?: string;
  name: string;
  measurements?: unknown;
  notes?: string;
}

export async function savePerson(input: PersonInput): Promise<Person> {
  const now = new Date().toISOString();
  const existing = input.id ? persons[input.id] : undefined;
  const id = existing?.id ?? input.id ?? makeId();

  const person: Person = {
    id,
    name: input.name,
    measurements: sanitizeMeasurements(input.measurements),
    notes: input.notes ?? "",
    created: existing?.created ?? now,
    modified: now,
  };

  persons[id] = person;
  await persistIndex();
  logger.info(`Person saved: ${person.name} (${id})`);
  return person;
}

export async function deletePerson(id: string): Promise<boolean> {
  if (!persons[id]) return false;
  delete persons[id];
  await persistIndex();
  logger.info(`Person deleted: ${id}`);
  return true;
}
