const { Notification } = require('electron');
const preferences = require('./preferences');
let session = null, timer = null;
function state() { return session ? {...session} : null; }
function stop() { clearTimeout(timer); timer = null; session = null; }
function start(minutes,taskId=null) {
  if (![25,50].includes(Number(minutes))) throw new Error('Choose a 25 or 50 minute session.');
  if(taskId&&!preferences.value.tasks.some(t=>t.id===taskId&&!t.completedAt))throw new Error('Choose an unfinished task.');
  stop();
  session = { startedAt: Date.now(), endsAt: Date.now() + Number(minutes) * 60000, minutes: Number(minutes), complete: false, taskId };
  timer = setTimeout(() => {
    session.complete = true;
    if (preferences.settings.notifications && Notification.isSupported()) new Notification({title:'Focus session complete',body:'A little space to reset. Take a break before your next session.'}).show();
    require('./tracker').notify();
  }, Number(minutes) * 60000);
  return state();
}
module.exports = { state, start, stop };
