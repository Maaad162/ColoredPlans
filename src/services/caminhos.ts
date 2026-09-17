import { collection, doc } from "firebase/firestore";
import { db } from "../config/firebase";
import { validarId } from "../config/dados";

export function perfilDocument(usuarioId: string) {
  return doc(db, "usuarios", validarId(usuarioId));
}

export function obraDocument(usuarioId: string, obraId: string) {
  return doc(perfilDocument(usuarioId), "obras", validarId(obraId));
}

export function mapasCollection(usuarioId: string, obraId: string) {
  return collection(obraDocument(usuarioId, obraId), "mapas");
}

export function mapaDocument(usuarioId: string, obraId: string, mapaId: string) {
  return doc(mapasCollection(usuarioId, obraId), validarId(mapaId));
}

// Preserva os IDs e caminhos existentes; cada Kit declara explicitamente sua obra.
export function kitsCollection(usuarioId: string) {
  return collection(perfilDocument(usuarioId), "kits");
}

export function legendasCollection(usuarioId: string) {
  return collection(perfilDocument(usuarioId), "legendas");
}
