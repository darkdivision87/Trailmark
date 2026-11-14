(function(root,factory){const model=factory();if(typeof module==='object')module.exports=model;else root.TrailmarkTasks=model;})(typeof window==='object'?window:globalThis,function(){
  const day=time=>{const d=new Date(time);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  function pending(tasks){return tasks.filter(t=>!t.completedAt).slice().sort((a,b)=>(a.priority??3)-(b.priority??3)||(a.order??a.createdAt)-(b.order??b.createdAt)||a.createdAt-b.createdAt);}
  function type(task,projects){return projects.find(p=>p.id===task.projectId)?.type||task.type||'Personal';}
  function wins(tasks,now=Date.now()){return tasks.filter(t=>t.completedAt&&day(t.completedAt)===day(now));}
  return {day,pending,type,wins};
});
