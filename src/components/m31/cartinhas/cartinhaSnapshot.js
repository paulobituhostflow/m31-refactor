const KEY='m31-cartinhas-kpi-confirmado-v1';
export function snapshotValido(s){
 return !!s && typeof s.snapshot_id==='string' && typeof s.gerado_em==='string' &&
  Number.isSafeInteger(s.inscritas_reconhecidas) && s.inscritas_reconhecidas>=0 &&
  Number.isSafeInteger(s.cartinhas_concluidas) && s.cartinhas_concluidas>=0 &&
  Number.isSafeInteger(s.cartinhas_concluidas_hoje) && s.cartinhas_concluidas_hoje>=0 &&
  s.meta_total===1000;
}
export function lerSnapshotConfirmado(){
 try{const s=JSON.parse(localStorage.getItem(KEY)||'null');return snapshotValido(s)?s:null;}catch{return null;}
}
export function guardarSnapshotConfirmado(s){
 if(!snapshotValido(s)) return false;
 try{localStorage.setItem(KEY,JSON.stringify(s));return true;}catch{return false;}
}
