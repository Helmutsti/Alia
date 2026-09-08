import { useEffect, useState } from "react";
import { api } from "./api.js";

let projects = [];
let loaded = false;
let loadingPromise = null;
const subscribers = new Set();

function notify() {
  for (const fn of subscribers) fn(projects);
}

export function loadProjects() {
  if (loadingPromise) return loadingPromise;
  loadingPromise = api.listProjects().then((rows) => {
    projects = rows;
    loaded = true;
    notify();
    return projects;
  });
  return loadingPromise;
}

export function refreshProjects() {
  loadingPromise = null;
  return loadProjects();
}

export function getProjects() {
  return projects;
}

export function useProjects() {
  const [state, setState] = useState(projects);
  useEffect(() => {
    if (!loaded) loadProjects();
    subscribers.add(setState);
    return () => subscribers.delete(setState);
  }, []);
  return state;
}
