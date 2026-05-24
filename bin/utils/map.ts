import { MapRegion } from "bc-bot";

type Pos = ChatRoomMapPos;

const createRange = (start: number, end: number) => 
    Array.from({ length: end - start + 1 }, (_, i) => start + i);

export const areTilesEqual = (tile1: Pos, tile2: Pos) =>
    tile1.X === tile2.X && tile1.Y === tile2.Y;

export const createTileList = (tiles: Pos[]) => {
    return Object.freeze(Object.assign(tiles, {
        covers(pos: Pos) {
            return tiles.some(t => areTilesEqual(t, pos));
        }
    }));
};

export const createArea = (corner1: Pos, corner2: Pos) => {
    const topLeft = { X: Math.min(corner1.X, corner2.X), Y: Math.min(corner1.Y, corner2.Y) };
    const botRight = { X: Math.max(corner1.X, corner2.X), Y: Math.max(corner1.X, corner1.Y) };

    const tiles = createTileList(
        createRange(topLeft.X, botRight.X).flatMap(
            x => createRange(topLeft.Y, botRight.Y).map(
                y => ({ X: x, Y: y }),
            ),
        )
    );

    const region: MapRegion = {
        TopLeft: topLeft,
        BottomRight: botRight,
    };

    return Object.freeze({
        tiles, region,
        covers(pos: Pos) {
           return this.tiles.covers(pos);
        },
    });
};

export type MapArea = ReturnType<typeof createArea>;