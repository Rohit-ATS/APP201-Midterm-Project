/**
 * vehicleMix.ts
 * ---------------------------------------------------------------------------
 * The fleet on the I-405 through the Sepulveda Pass.
 *
 * This file exists so that the single most important constant in the whole
 * project — the effective vehicle length L — is DERIVED rather than assumed.
 *
 * A traffic API tells you how fast cars are moving. It does not tell you what
 * they are. So the simulator picks vehicle types at random from the mix below,
 * and the model takes its L from the same mix's weighted mean length plus the
 * bumper gap drivers keep when stopped.
 *
 * Shares are drawn from the Caltrans District 7 vehicle classification counts
 * for the West LA / Sepulveda corridor and the FHWA class distribution for
 * urban non-truck-route freeways. The I-405 through the pass carries unusually
 * few heavy trucks for a US interstate (no major freight destination, steep
 * grades, and a commuter-dominated peak), which is why the semi share is ~2%
 * rather than the 8-12% typical of, say, the I-5.
 */

export interface VehicleClass {
  id: string;
  label: string;
  /** share of the fleet, 0-1 */
  share: number;
  /** bumper-to-bumper length, metres */
  length: number;
  /** width, metres — used by the 3D scene */
  width: number;
  /** roof height, metres */
  height: number;
  /** body silhouette the 3D scene builds */
  body: 'sedan' | 'suv' | 'pickup' | 'van' | 'box' | 'semi' | 'bus' | 'moto';
}

export const VEHICLE_CLASSES: VehicleClass[] = [
  { id: 'sedan', label: 'Sedan',       share: 0.380, length: 4.7,  width: 1.82, height: 1.45, body: 'sedan'  },
  { id: 'suv',   label: 'SUV',          share: 0.340, length: 4.9,  width: 1.92, height: 1.72, body: 'suv'    },
  { id: 'pickup',label: 'Pickup',       share: 0.120, length: 5.8,  width: 2.03, height: 1.90, body: 'pickup' },
  { id: 'van',   label: 'Van',          share: 0.060, length: 5.2,  width: 1.95, height: 1.80, body: 'van'    },
  { id: 'box',   label: 'Box truck',    share: 0.040, length: 8.5,  width: 2.44, height: 3.30, body: 'box'    },
  { id: 'moto',  label: 'Motorcycle',   share: 0.025, length: 2.2,  width: 0.80, height: 1.30, body: 'moto'   },
  { id: 'semi',  label: 'Semi-trailer', share: 0.020, length: 21.0, width: 2.59, height: 4.11, body: 'semi'   },
  { id: 'bus',   label: 'Transit bus',  share: 0.015, length: 12.2, width: 2.55, height: 3.20, body: 'bus'    },
];

/** Bumper gap drivers leave at a dead stop, metres. Observed ~1.8-2.2 m. */
export const STOPPED_GAP = 2.0;

/** Weighted mean bumper-to-bumper length of the fleet, metres. */
export const meanVehicleLength = (): number =>
  VEHICLE_CLASSES.reduce((sum, v) => sum + v.share * v.length, 0);

/**
 * The effective length L used throughout the model:
 * the average car, plus the space it still occupies when everything stops.
 *
 *   L = mean length + stopped gap  ~=  5.46 + 2.0  =  7.46 m
 *
 * Rounded to 7.5 m in DEFAULT_PARAMS. This is the number that, divided by the
 * reaction time, gives the backward wave speed.
 */
export const effectiveLength = (): number => meanVehicleLength() + STOPPED_GAP;

/** Cumulative distribution, for weighted random sampling in the simulator. */
const CUMULATIVE = (() => {
  let acc = 0;
  return VEHICLE_CLASSES.map((v) => {
    acc += v.share;
    return acc;
  });
})();

/** Draw a vehicle class at random, respecting the real-world shares. */
export function sampleVehicleClass(rand: number = Math.random()): VehicleClass {
  const r = rand * CUMULATIVE[CUMULATIVE.length - 1];
  for (let i = 0; i < CUMULATIVE.length; i++) {
    if (r <= CUMULATIVE[i]) return VEHICLE_CLASSES[i];
  }
  return VEHICLE_CLASSES[0];
}
