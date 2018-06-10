const {Seq} = require('immutable');
const Docker = require('dockerode');
const Slack = require('./slack');
const JSONStream = require('JSONStream');
const templates = require('./templates');
const imageRegExp = new RegExp(process.env.image_regexp);
const docker = new Docker();
const slack = new Slack({
  'username': 'docker',
  'iconEmoji': ':whale:'
});

async function sendEvent(event) {
  console.info(event);
  hostname_string = '';
  if (process.env.include_hostname) {
    hostname_string = '@ ' + process.env.HOSTNAME
  }
  if (imageRegExp.test(event.from)) {
    const template = templates[`${event.Type}_${event.Action}`];
    if (template) {
      const attachment = template(event);
      if (attachment) {
        await slack.send({
          username: `docker ${event.Type} ${event.Actor.Attributes.name} ${hostname_string}`,
          attachments: [attachment],
        });
      }
    }
  }
}

async function sendEventStream() {
  const eventStream = await docker.getEvents();
  eventStream.pipe(JSONStream.parse())
    .on('data', event => sendEvent(event).catch(handleError))
    .on('error', handleError);
}

async function sendVersion() {
  const version = await docker.version();
  let hostname_string = '';
  if (process.env.include_hostname) {

    const dockerInfo = await docker.info();
    const nodeHostname = dockerInfo.Name;
    const worker = !dockerInfo.Swarm.ControlAvailable;
    let swarmMode = false;
    if (dockerInfo.Swarm.NodeID) {
      swarmMode = true;
    }

    hostname_string = `Node @ ${nodeHostname}`;
    if (swarmMode) {
      if ( worker ) {
        hostname_string += ' (Swarm Worker)';
      } else {
        hostname_string += ' (Swarm Manager)';
      }
    }

  }
  await slack.sendAttachment({
    text: `Docker is running: ${hostname_string}`,
    color: 'good',
    fields: Seq(version).map((value, title) => ({title, value, short: true})).toArray(),
  });
}

async function main() {
  await sendVersion();
  await sendEventStream();
}

function handleError(e) {
  console.error(e);
  slack.sendError(e).catch(console.error);
}

main().catch(handleError);

