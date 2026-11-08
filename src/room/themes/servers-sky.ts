// The page behind the automatons' server room, in sky pixels (sky.ts): the dark of a data centre at night, a network
// of nodes and the links between them, and far below the skyline of server towers with their diodes. On the layer
// that moves, packets of data run along the links and the diodes blink. Positions are pure functions of the size
// (tested without a DOM, room.test.ts), the painting reads the palette of design/theme-servers.ts.
import { SERVERS_SKY as K } from '../../design/theme-servers.ts';
import { css, mix, rgb } from '../lighting.ts';
import { pick } from '../sky.ts';

type Context = CanvasRenderingContext2D;
interface Node { x: number; y: number }

/** How many sky pixels of sky a node of the network takes, at most one node per cell of this size. */
const CELL = 46;

/** The nodes of the network: one in some cells of a grid over the upper two thirds of the page, nudged in its cell. */
export function skyNodes(width: number, height: number): Node[] {
  const nodes: Node[] = [];
  const columns = Math.max(1, Math.floor(width / CELL)), rows = Math.max(1, Math.floor(height * 0.66 / CELL));
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    if (pick(`node${column},${row}`, 3) === 0) continue;
    nodes.push({ x: column * CELL + 6 + pick(`nx${column},${row}`, CELL - 12), y: row * CELL + 6 + pick(`ny${column},${row}`, CELL - 12) });
  }
  return nodes;
}

/** The links of the network: each node to its nearest one or two neighbours, each link once (by index, lower first). */
export function skyLinks(nodes: readonly Node[]): [number, number][] {
  const links = new Map<string, [number, number]>();
  nodes.forEach((node, index) => {
    const nearest = nodes.map((other, at) => ({ at, far: Math.hypot(other.x - node.x, other.y - node.y) }))
      .filter(({ at, far }) => at !== index && far < CELL * 1.8).sort((a, b) => a.far - b.far).slice(0, 1 + pick(`links${index}`, 2));
    for (const { at } of nearest) {
      const link: [number, number] = index < at ? [index, at] : [at, index];
      links.set(link.join(), link);
    }
  });
  return [...links.values()];
}

/** The server towers along the bottom of the page: their left edge, width and height, side by side. */
export function skyTowers(width: number, height: number): { x: number; width: number; height: number }[] {
  const towers = [];
  for (let x = 0, index = 0; x < width; index++) {
    const across = 8 + pick(`tw${index}`, 10);
    towers.push({ x, width: across, height: Math.round(height * (0.08 + pick(`th${index}`, 12) / 100)) });
    x += across + 1 + pick(`gap${index}`, 3);
  }
  return towers;
}

function dot(context: Context, x: number, y: number, colour: string) {
  context.fillStyle = colour;
  context.fillRect(Math.round(x), Math.round(y), 1, 1);
}

function link(context: Context, from: Node, to: Node, colour: string) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let step = 0; step <= steps; step++) dot(context, from.x + (to.x - from.x) * step / steps, from.y + (to.y - from.y) * step / steps, colour);
}

/** The still part: the dark, the network's links and nodes, the towers. */
export function paintServerSky(context: Context, width: number, height: number) {
  for (let y = 0; y < height; y += 3) {
    context.fillStyle = css(mix(rgb(K.top), rgb(K.bottom), y / height));
    context.fillRect(0, y, width, 3);
  }
  const nodes = skyNodes(width, height);
  for (const [a, b] of skyLinks(nodes)) link(context, nodes[a], nodes[b], K.link);
  for (const node of nodes) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) dot(context, node.x + dx, node.y + dy, K.nodeHalo);
    dot(context, node.x, node.y, K.node);
  }
  for (const tower of skyTowers(width, height)) {
    context.fillStyle = K.tower;
    context.fillRect(tower.x, height - tower.height, tower.width, tower.height);
    context.fillStyle = K.towerEdge;
    context.fillRect(tower.x, height - tower.height, tower.width, 1);
  }
}

/** Where a packet is along a link at `seconds`, from 0 to 1, each link on its own beat. */
export const packetShare = (index: number, seconds: number) => ((seconds / (2 + pick(`beat${index}`, 4)) + pick(`phase${index}`, 100) / 100) % 1 + 1) % 1;

/** What moves: a packet along every other link, and the towers' diodes, a few lit at a time. */
export function paintServerSkyMotion(context: Context, width: number, height: number, seconds: number) {
  context.clearRect(0, 0, width, height);
  const nodes = skyNodes(width, height);
  skyLinks(nodes).forEach(([a, b], index) => {
    if (index % 2) return;
    const share = packetShare(index, seconds);
    const from = nodes[a], to = nodes[b];
    dot(context, from.x + (to.x - from.x) * share, from.y + (to.y - from.y) * share, K.packet);
  });
  const beat = Math.floor(seconds * 2);
  for (const [index, tower] of skyTowers(width, height).entries()) {
    for (let row = 3; row < tower.height - 2; row += 4) for (let column = 2; column < tower.width - 1; column += 3) {
      if (pick(`led${index},${row},${column},${beat}`, 5) !== 0) continue;
      dot(context, tower.x + column, height - tower.height + row, K.diodes[pick(`colour${index},${row},${column}`, K.diodes.length)]);
    }
  }
}
