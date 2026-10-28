import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {createRequire} from 'node:module';
import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
test('formulário real exige apenas nome e telefone e explica participação e pagamento separados',()=>{
 const source=fs.readFileSync(new URL('../../src/components/m31/operacional/gestao/GestaoInscricaoForm.jsx',import.meta.url),'utf8');
 const fields={nome:'Pessoa Sintética',whatsapp:'5581999990000',email:'',cpf:'',cidade:'',estado:''};
 const context=vm.createContext({exports:{},crypto,require:name=>{
  if(name==='@tanstack/react-query')return {useQuery:()=>({data:{items:[]}})};
  if(name==='lucide-react')return {Check:()=>null,Loader2:()=>null,Sparkles:()=>null};
  if(name==='@/lib/m31GestaoApi')return {EMPTY_GESTAO_FIELDS:fields,onlyGestaoFields:v=>v,gestaoError:()=>'',gestaoOperation:()=>{throw Error('no_remote_calls');},mergeGestaoSuggestions:()=>fields};
  if(name==='@/lib/m31GestaoTelefone')return {formatarGestaoTelefone:v=>v,normalizarGestaoTelefone:v=>v};
  return require(name);
 }});
 vm.runInContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
 const html=renderToStaticMarkup(React.createElement(context.exports.default,{sessionId:'synthetic',onSubmit(){}}));
 const required=[...html.matchAll(/<input\b[^>]*>/g)].filter(m=>/\brequired(?:=""|\s|>)/.test(m[0])).map(m=>m[0].match(/name="([^"]+)"/)[1]);
 assert.deepEqual(required,['nome','whatsapp']);assert.match(html,/A participação será confirmada pela equipe/);assert.match(html,/O pagamento ficará pendente/);assert.match(html,/Cadastrar inscrição/);
});
