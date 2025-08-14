'use client'
import { useState } from 'react'

type Node = { id: string; label: string; options: { text: string; next: string|null }[] }
export default function Page(){
  const [nodes, setNodes] = useState<Node[]>([
    { id:'start', label:'Welcome Jackson!\n1. Register\n2. Balance', options:[{text:'1', next:'reg'},{text:'2', next:'bal'}] },
    { id:'reg', label:'Enter name:', options:[] },
    { id:'bal', label:'Balance: GHS 0.00', options:[] },
  ])
  const [selected, setSelected] = useState('start')

  function addNode(){
    const id = `n${nodes.length+1}`
    setNodes([...nodes, { id, label:'New screen', options:[] }]); setSelected(id)
  }

  function exportFastAPI(){
    const code = genFastAPI(nodes)
    download('fastapi_ussd.py', code)
  }
  function exportExpress(){
    const code = genExpress(nodes)
    download('express_ussd.js', code)
  }
  function download(name:string, content:string){
    const b = new Blob([content], { type:'text/plain' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; a.click()
  }

  const n = nodes.find(n=> n.id===selected)!

  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-3">USSD Flow Studio</h1>
      <div className="grid md:grid-cols-[260px,1fr] gap-4">
        <aside className="border rounded p-2">
          <div className="flex justify-between items-center mb-2"><b>Screens</b><button className="border rounded px-2 py-1" onClick={addNode}>+ Add</button></div>
          <ul className="text-sm">
            {nodes.map(x=> <li key={x.id}><button className={`w-full text-left px-2 py-1 rounded ${x.id===selected?'bg-black text-white':'hover:bg-gray-100'}`} onClick={()=> setSelected(x.id)}>{x.id}</button></li>)}
          </ul>
          <div className="mt-3 grid gap-2">
            <button className="border rounded px-2 py-1" onClick={exportFastAPI}>Export FastAPI</button>
            <button className="border rounded px-2 py-1" onClick={exportExpress}>Export Express</button>
          </div>
        </aside>
        <section className="border rounded p-3">
          <input value={n.label} onChange={e=>{ n.label=e.target.value; setNodes([...nodes]) }} className="border p-2 rounded w-full" />
          <div className="mt-3">
            <b>Options</b>
            {n.options.map((o, i)=> (
              <div key={i} className="grid grid-cols-[1fr,1fr,80px] gap-2 mt-1">
                <input placeholder="Text (e.g., 1)" value={o.text} onChange={e=>{o.text=e.target.value; setNodes([...nodes])}} className="border p-2 rounded" />
                <select value={o.next||''} onChange={e=>{o.next = e.target.value||null; setNodes([...nodes])}} className="border p-2 rounded">
                  <option value="">(none)</option>
                  {nodes.map(nn=> <option key={nn.id} value={nn.id}>{nn.id}</option>)}
                </select>
                <button className="border rounded" onClick={()=>{ n.options.splice(i,1); setNodes([...nodes])}}>✕</button>
              </div>
            ))}
            <button className="mt-2 border rounded px-2 py-1" onClick={()=>{ n.options.push({ text:'', next:null }); setNodes([...nodes])}}>+ Add option</button>
          </div>
        </section>
      </div>
    </main>
  )
}

function genFastAPI(nodes: Node[]){
  return `from fastapi import FastAPI, Form
from fastapi.responses import PlainTextResponse
app = FastAPI()

NODES = ${JSON.stringify(nodes, null, 2)}

def next_label(state, choice):
    for o in state.get('options', []):
        if o.get('text') == choice:
            nxt = o.get('next')
            if nxt:
                return next(n for n in NODES if n['id']==nxt)['label']
    return 'END Bye'

@app.post('/ussd', response_class=PlainTextResponse)
async def ussd(sessionId: str = Form(...), phoneNumber: str = Form(...), text: str = Form('')):
    parts = text.split('*') if text else []
    if not parts:
        return 'CON ' + next(n for n in NODES if n['id']=='start')['label']
    state = next(n for n in NODES if n['id']=='start')
    label = state['label']
    for p in parts:
        label = next_label(state, p)
        state = next((n for n in NODES if n['label']==label), state)
    if label.startswith('END'): return label
    return 'CON ' + label
`
}

function genExpress(nodes: Node[]){
  return `import express from 'express'
import bodyParser from 'body-parser'
const app = express(); app.use(bodyParser.urlencoded({extended:false}))

const NODES = ${JSON.stringify(nodes, null, 2)}

function nextLabel(state, choice){
  for (const o of (state.options||[])) { if(o.text===choice && o.next){ return NODES.find(n=> n.id===o.next).label } }
  return 'END Bye'
}

app.post('/ussd', (req,res)=>{
  const { text='' } = req.body||{}
  const parts = text ? text.split('*') : []
  if(parts.length===0){ return res.send('CON ' + NODES.find(n=> n.id==='start').label) }
  let state = NODES.find(n=> n.id==='start')
  let label = state.label
  for(const p of parts){ label = nextLabel(state,p); state = NODES.find(n=> n.label===label)||state }
  if(label.startsWith('END')) return res.send(label)
  return res.send('CON ' + label)
})

app.listen(3000, ()=> console.log('USSD ready on :3000'))
`
}