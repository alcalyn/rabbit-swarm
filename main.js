//import * as PIXI from './pixi';

const { Application, Container, Graphics, Point, Sprite, Ticker } = PIXI;
const { PI, random, sin, cos, abs, atan2, sqrt, min } = Math;

const app = new Application({
    background: '#232327',
    resizeTo: window,
});

document.body.appendChild(app.view);

const { clientWidth, clientHeight } = document.body;
const halfClientWidth = clientWidth / 2;
const halfClientHeight = clientHeight / 2;

const createBirdSprite = () => {
    const birdSprite = Sprite.from('./bunny.png');
    birdSprite.anchor.set(0.5, 0.5);
    return birdSprite;
}

/**
 * Square of a distance between a and b, yes, but in a toroidal space.
 *
 * @param {Bird} a
 * @param {Bird} b
 *
 * @returns {number}
 */
const dist2 = (a, b) => {
    // (optimized get position)
    let dx = abs(a.transform.position._x - b.transform.position._x);
    let dy = abs(a.transform.position._y - b.transform.position._y);

    if (dx > halfClientWidth) dx = clientWidth - dx;
    if (dy > halfClientHeight) dy = clientHeight - dy;

    return dx * dx + dy * dy;
};

/**
 * Rotation a bird must have to aim another bird in a toroidal space.
 *
 * @param {Bird} a
 * @param {Bird} b
 *
 * @returns {number}
 */
const rotationTo = (from, to) => {
    let dx = to.x - from.x;
    let dy = to.y - from.y;

    if (dx > clientWidth / 2) dx -= clientWidth;
    if (dx < -clientWidth / 2) dx += clientWidth;
    if (dy > clientHeight / 2) dy -= clientHeight;
    if (dy < -clientHeight / 2) dy += clientHeight;

    return atan2(dy, dx) + PI / 2;
};

/**
 * @param {number} r1
 * @param {number} r0
 */
const rotationDiff = (r1, r0) => {
    let diff = r1 - r0;

    if (diff > PI) diff -= 2 * PI;
    if (diff < -PI) diff += 2 * PI;

    return diff;
};

class Bird extends Container {

    /*
     * === Simulation parameters ===
     */

    /**
     * Bird speed in pixel in a single tick
     */
    static SPEED = 5;

    /**
     * Max rotation speed in a single tick
     */
    static ROTATION_SPEED = 0.05;

    /**
     * square of area 1 boundary.
     * before: avoid, after: align
     */
    static AREA_1 = 20 ** 2;

    /**
     * square of area 2 boundary.
     * after: go to
     */
    static AREA_2 = 60 ** 2;

    /**
     * influence from other nearest birds
     */
    static influences = [
        1,
        0.95,
        0.90,
        0.70,
        0.40,
        0.10,
    ];

    /*
     * === END Simulation parameters ===
     */

    /**
     * Sum of influences, used for average calculation
     */
    static influencesSum = Bird.influences.reduce((prev, curr) => prev + curr, 0);

    /**
     * Optim: do not process all birds, but only some in the bird neighborhood.
     *
     * @type {number}
     */
    neighboorhoodSizeSquare = Infinity;

    constructor() {
        super();

        this.addChild(createBirdSprite());
        this.#setRandomPosition();
    }

    #setRandomPosition() {
        this.x = random() * clientWidth;
        this.y = random() * clientHeight;
        this.rotation = random() * 2 * PI;
    }

    /**
     * Get the squared distance to the N-th bird (depending on Bird.influences.length)
     * plus a margin of some bird speed.
     * Used to not process all birds, but only some in the bird neighborhood.
     */
    #calcNewLimit(nearestBirds) {
        if (0 === nearestBirds.length) {
            return Infinity;
        }

        return (
            sqrt(
                nearestBirds[min(
                    nearestBirds.length,
                    Bird.influences.length
                ) - 1].dist2
            )
            + Bird.SPEED * 5
        ) ** 2;
    }

    #updateRotation() {
        const nearestBirds = [];

        for (let i = 0; i < sky.length; ++i) {
            if (sky[i] === this) {
                continue;
            }

            const _dist2 = dist2(this, sky[i]);

            if (_dist2 < this.neighboorhoodSizeSquare) {
                nearestBirds.push({
                    bird: sky[i],
                    dist2: _dist2,
                });
            }
        }

        nearestBirds.sort((a, b) => a.dist2 - b.dist2);

        // optim: neighborhood size update
        this.neighboorhoodSizeSquare = this.#calcNewLimit(nearestBirds);

        let deltaRotation = 0;

        for (let i = 0; i < min(nearestBirds.length, Bird.influences.length); ++i) {
            if (dist2 < Bird.AREA_1) {
                deltaRotation += this.#updateRotationAvoid(nearestBirds[i].bird) * Bird.influences[i];
            } else if (dist2 > Bird.AREA_2) {
                deltaRotation += this.#updateRotationGoto(nearestBirds[i].bird) * Bird.influences[i];
            } else {
                deltaRotation += this.#updateRotationAlign(nearestBirds[i].bird) * Bird.influences[i];
            }
        }

        this.rotation += deltaRotation / Bird.influencesSum;
    }

    /**
     * @param {Bird} bird
     * @returns {number} between -Bird.ROTATION_SPEED and Bird.ROTATION_SPEED
     */
    #updateRotationAvoid(bird) {
        const birdDirection = rotationTo(this, bird);

        return this.#alignToRotation(birdDirection + PI);
    }

    /**
     * @param {Bird} bird
     * @returns {number} between -Bird.ROTATION_SPEED and Bird.ROTATION_SPEED
     */
    #updateRotationGoto(bird) {
        const birdDirection = rotationTo(this, bird);

        return this.#alignToRotation(birdDirection);
    }

    /**
     * @param {Bird} bird
     * @returns {number} between -Bird.ROTATION_SPEED and Bird.ROTATION_SPEED
     */
    #updateRotationAlign(bird) {
        return this.#alignToRotation(bird.rotation);
    }

    /**
     * @param {number} rotation
     */
    #alignToRotation(rotation) {
        const diff = rotationDiff(rotation, this.rotation);

        if (diff > Bird.ROTATION_SPEED) return Bird.ROTATION_SPEED;
        else if (diff < -Bird.ROTATION_SPEED) return -Bird.ROTATION_SPEED;
        else return diff;
    }

    tick(delta) {
        this.#updateRotation();

        // travel at bird speed
        this.x += sin(this.rotation) * Bird.SPEED * delta;
        this.y -= cos(this.rotation) * Bird.SPEED * delta;

        // do not break the donut
        if (this.x > clientWidth) this.x -= clientWidth;
        if (this.x < 0) this.x += clientWidth;
        if (this.y > clientHeight) this.y -= clientHeight;
        if (this.y < 0) this.y += clientHeight;
    }
}

const BIRDS_COUNT = 500;
const sky = [];

for (let i = 0; i < BIRDS_COUNT; ++i) {
    const bird = new Bird(sky);
    sky.push(bird);
    app.stage.addChild(bird);
}

Ticker.shared.add(delta => {
    sky.forEach(bird => {
        bird.tick(delta);
    });
});
