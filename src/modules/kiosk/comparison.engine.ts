export interface SpecData {
  sku: string;
  category: string;
  display_type: string;
  display_size_inches: number;
  resolution: string;
  ppi: number;
  peak_brightness_nits: number;
  refresh_rate_hz: string;
  glass_durability: string;
  camera_main: string;
  camera_telephoto: string;
  camera_ultrawide: string;
  video_recording_max: string;
  camera_features: string[] | string;
  processor_soc: string;
  geekbench_single_score: number;
  geekbench_multi_score: number;
  gpu_3dmark_extreme_score: number;
  ai_npu_tops: number;
  battery_capacity_mah: number;
  wired_charging_watts: number;
  wireless_charging_watts: number;
  reverse_wireless_supported: boolean | number;
  rated_video_playback_hours: number;
  weight_grams: number;
  thickness_mm: number;
  chassis_material: string;
  ip_rating: string;
  stylus_supported: boolean | number;
}

export interface ComparisonResult {
  skus: string[];
  dimensions: {
    display: {
      winnerSku: string;
      rationale: string;
      items: Array<{ label: string; values: Record<string, any>; winnerSku?: string; deltaText?: string }>;
    };
    camera: {
      winnerSku: string;
      rationale: string;
      items: Array<{ label: string; values: Record<string, any>; winnerSku?: string }>;
    };
    performance: {
      winnerSku: string;
      rationale: string;
      items: Array<{ label: string; values: Record<string, any>; winnerSku?: string; deltaText?: string }>;
    };
    battery: {
      winnerSku: string;
      rationale: string;
      items: Array<{ label: string; values: Record<string, any>; winnerSku?: string; deltaText?: string }>;
    };
    chassis: {
      winnerSku: string;
      rationale: string;
      items: Array<{ label: string; values: Record<string, any>; winnerSku?: string; deltaText?: string }>;
    };
  };
  executiveVerdict: {
    modelAWins: string[];
    modelBWins: string[];
    bestForSummary: Record<string, string>;
  };
}

export class ComparisonEngine {
  public static computeDifferentials(modelA: SpecData, modelB: SpecData): ComparisonResult {
    const skuA = modelA.sku;
    const skuB = modelB.sku;

    // 1. Display Differentials
    const brightnessDelta = ((modelA.peak_brightness_nits - modelB.peak_brightness_nits) / modelB.peak_brightness_nits) * 100;
    const displayWinner = brightnessDelta >= 0 ? skuA : skuB;
    const displayRationale = brightnessDelta >= 0
      ? `${skuA} offers ${Math.abs(Math.round(brightnessDelta))}% brighter peak luminance (${modelA.peak_brightness_nits} nits)`
      : `${skuB} offers ${Math.abs(Math.round(brightnessDelta))}% brighter peak luminance (${modelB.peak_brightness_nits} nits)`;

    // 2. Performance Differentials
    const geekSingleDelta = ((modelA.geekbench_single_score - modelB.geekbench_single_score) / modelB.geekbench_single_score) * 100;
    const geekMultiDelta = ((modelA.geekbench_multi_score - modelB.geekbench_multi_score) / modelB.geekbench_multi_score) * 100;
    const gpuDelta = ((modelA.gpu_3dmark_extreme_score - modelB.gpu_3dmark_extreme_score) / modelB.gpu_3dmark_extreme_score) * 100;
    const aiDelta = ((modelA.ai_npu_tops - modelB.ai_npu_tops) / modelB.ai_npu_tops) * 100;

    const perfWinner = (geekMultiDelta + gpuDelta >= 0) ? skuA : skuB;
    const perfRationale = (geekMultiDelta + gpuDelta >= 0)
      ? `${skuA} leads in multi-core compute & GPU rendering`
      : `${skuB} leads in multi-core compute & GPU rendering`;

    // 3. Battery Differentials
    const batteryDelta = ((modelA.battery_capacity_mah - modelB.battery_capacity_mah) / modelB.battery_capacity_mah) * 100;
    const chargingDelta = ((modelA.wired_charging_watts - modelB.wired_charging_watts) / modelB.wired_charging_watts) * 100;
    const batteryWinner = batteryDelta >= 0 ? skuA : skuB;
    const batteryRationale = batteryDelta >= 0
      ? `${skuA} features larger battery (${modelA.battery_capacity_mah} mAh, +${Math.round(batteryDelta)}%)`
      : `${skuB} features larger battery (${modelB.battery_capacity_mah} mAh, +${Math.round(Math.abs(batteryDelta))}%)`;

    // 4. Chassis & Ergonomics (Lighter & thinner is better)
    const weightDelta = modelA.weight_grams - modelB.weight_grams;
    const thicknessDelta = modelA.thickness_mm - modelB.thickness_mm;
    const chassisWinner = weightDelta <= 0 ? skuA : skuB;
    const chassisRationale = weightDelta <= 0
      ? `${skuA} is ${Math.abs(weightDelta)}g lighter in hand`
      : `${skuB} is ${Math.abs(weightDelta)}g lighter in hand`;

    // 5. Camera Winner
    const cameraWinner = (modelA.video_recording_max.includes('8K') || modelA.camera_main.includes('200MP')) ? skuA : skuB;
    const cameraRationale = cameraWinner === skuA
      ? `${skuA} leads with ultra-high resolution sensor and 8K capture`
      : `${skuB} leads with ProRes Log 4K@120fps video mastering`;

    // Format Camera Features
    const parseCamFeatures = (f: any) => {
      if (Array.isArray(f)) return f;
      if (typeof f === 'string') {
        try { return JSON.parse(f); } catch { return [f]; }
      }
      return [];
    };

    const featuresA = parseCamFeatures(modelA.camera_features);
    const featuresB = parseCamFeatures(modelB.camera_features);

    return {
      skus: [skuA, skuB],
      dimensions: {
        display: {
          winnerSku: displayWinner,
          rationale: displayRationale,
          items: [
            {
              label: 'Screen Technology',
              values: { [skuA]: modelA.display_type, [skuB]: modelB.display_type }
            },
            {
              label: 'Display Size & PPI',
              values: {
                [skuA]: `${modelA.display_size_inches}" (${modelA.ppi} PPI)`,
                [skuB]: `${modelB.display_size_inches}" (${modelB.ppi} PPI)`
              },
              winnerSku: modelA.ppi >= modelB.ppi ? skuA : skuB,
              deltaText: `${Math.abs(modelA.ppi - modelB.ppi)} PPI Differential`
            },
            {
              label: 'Peak Brightness',
              values: {
                [skuA]: `${modelA.peak_brightness_nits} nits`,
                [skuB]: `${modelB.peak_brightness_nits} nits`
              },
              winnerSku: displayWinner,
              deltaText: `${Math.abs(Math.round(brightnessDelta))}% Advantage`
            },
            {
              label: 'Refresh Rate',
              values: { [skuA]: modelA.refresh_rate_hz, [skuB]: modelB.refresh_rate_hz }
            },
            {
              label: 'Glass Protection',
              values: { [skuA]: modelA.glass_durability, [skuB]: modelB.glass_durability }
            }
          ]
        },
        camera: {
          winnerSku: cameraWinner,
          rationale: cameraRationale,
          items: [
            {
              label: 'Main Camera Sensor',
              values: { [skuA]: modelA.camera_main, [skuB]: modelB.camera_main },
              winnerSku: cameraWinner
            },
            {
              label: 'Telephoto Optical Zoom',
              values: { [skuA]: modelA.camera_telephoto, [skuB]: modelB.camera_telephoto }
            },
            {
              label: 'Ultra-Wide Sensor',
              values: { [skuA]: modelA.camera_ultrawide, [skuB]: modelB.camera_ultrawide }
            },
            {
              label: 'Maximum Video Recording',
              values: { [skuA]: modelA.video_recording_max, [skuB]: modelB.video_recording_max }
            },
            {
              label: 'Key Optical Features',
              values: {
                [skuA]: featuresA.join(' • '),
                [skuB]: featuresB.join(' • ')
              }
            }
          ]
        },
        performance: {
          winnerSku: perfWinner,
          rationale: perfRationale,
          items: [
            {
              label: 'Processor / Silicon',
              values: { [skuA]: modelA.processor_soc, [skuB]: modelB.processor_soc }
            },
            {
              label: 'Geekbench 6 Single-Core',
              values: { [skuA]: modelA.geekbench_single_score, [skuB]: modelB.geekbench_single_score },
              winnerSku: geekSingleDelta >= 0 ? skuA : skuB,
              deltaText: `${Math.abs(Math.round(geekSingleDelta))}% Lead`
            },
            {
              label: 'Geekbench 6 Multi-Core',
              values: { [skuA]: modelA.geekbench_multi_score, [skuB]: modelB.geekbench_multi_score },
              winnerSku: geekMultiDelta >= 0 ? skuA : skuB,
              deltaText: `${Math.abs(Math.round(geekMultiDelta))}% Lead`
            },
            {
              label: '3DMark GPU Extreme',
              values: { [skuA]: modelA.gpu_3dmark_extreme_score, [skuB]: modelB.gpu_3dmark_extreme_score },
              winnerSku: gpuDelta >= 0 ? skuA : skuB,
              deltaText: `${Math.abs(Math.round(gpuDelta))}% Graphic Power`
            },
            {
              label: 'AI NPU Engine (TOPS)',
              values: { [skuA]: `${modelA.ai_npu_tops} TOPS`, [skuB]: `${modelB.ai_npu_tops} TOPS` },
              winnerSku: aiDelta >= 0 ? skuA : skuB,
              deltaText: `${Math.abs(Math.round(aiDelta))}% Neural Speed`
            }
          ]
        },
        battery: {
          winnerSku: batteryWinner,
          rationale: batteryRationale,
          items: [
            {
              label: 'Battery Capacity',
              values: { [skuA]: `${modelA.battery_capacity_mah} mAh`, [skuB]: `${modelB.battery_capacity_mah} mAh` },
              winnerSku: batteryWinner,
              deltaText: `${Math.abs(Math.round(batteryDelta))}% Differential`
            },
            {
              label: 'Wired Fast Charging',
              values: { [skuA]: `${modelA.wired_charging_watts}W`, [skuB]: `${modelB.wired_charging_watts}W` },
              winnerSku: chargingDelta >= 0 ? skuA : skuB,
              deltaText: `${Math.abs(Math.round(chargingDelta))}% Faster`
            },
            {
              label: 'Wireless Charging',
              values: { [skuA]: `${modelA.wireless_charging_watts}W`, [skuB]: `${modelB.wireless_charging_watts}W` }
            },
            {
              label: 'Reverse Wireless Charging',
              values: {
                [skuA]: modelA.reverse_wireless_supported ? 'Supported' : 'Not Supported',
                [skuB]: modelB.reverse_wireless_supported ? 'Supported' : 'Not Supported'
              },
              winnerSku: modelA.reverse_wireless_supported ? skuA : skuB
            },
            {
              label: 'Rated Video Playback',
              values: {
                [skuA]: `${modelA.rated_video_playback_hours} Hours`,
                [skuB]: `${modelB.rated_video_playback_hours} Hours`
              },
              winnerSku: modelA.rated_video_playback_hours >= modelB.rated_video_playback_hours ? skuA : skuB
            }
          ]
        },
        chassis: {
          winnerSku: chassisWinner,
          rationale: chassisRationale,
          items: [
            {
              label: 'Weight (Grams)',
              values: { [skuA]: `${modelA.weight_grams}g`, [skuB]: `${modelB.weight_grams}g` },
              winnerSku: chassisWinner,
              deltaText: `${Math.abs(weightDelta)}g Lighter`
            },
            {
              label: 'Thickness (mm)',
              values: { [skuA]: `${modelA.thickness_mm} mm`, [skuB]: `${modelB.thickness_mm} mm` },
              winnerSku: thicknessDelta <= 0 ? skuA : skuB,
              deltaText: `${Math.abs(thicknessDelta).toFixed(2)} mm Thinner`
            },
            {
              label: 'Frame Materials',
              values: { [skuA]: modelA.chassis_material, [skuB]: modelB.chassis_material }
            },
            {
              label: 'Water & Dust Resistance',
              values: { [skuA]: modelA.ip_rating, [skuB]: modelB.ip_rating }
            },
            {
              label: 'Active Stylus / S-Pen',
              values: {
                [skuA]: modelA.stylus_supported ? 'Integrated S-Pen' : 'Not Supported',
                [skuB]: modelB.stylus_supported ? 'Integrated S-Pen' : 'Not Supported'
              },
              winnerSku: modelA.stylus_supported ? skuA : (modelB.stylus_supported ? skuB : undefined)
            }
          ]
        }
      },
      executiveVerdict: {
        modelAWins: [
          geekSingleDelta > 0 ? 'Single-Core CPU Performance' : 'Display Peak Brightness',
          weightDelta < 0 ? 'Lighter in Hand' : 'Faster 45W Charging',
          modelA.rated_video_playback_hours > modelB.rated_video_playback_hours ? 'Longer Video Battery Endurance' : 'Integrated Stylus & Note Taking'
        ],
        modelBWins: [
          geekMultiDelta < 0 ? 'Multi-Core Compute & GPU Gaming' : 'ProRes 4K120 Video Capture',
          brightnessDelta < 0 ? 'Brighter Display with Gorilla Armor' : 'Titanium Craftsmanship',
          batteryDelta < 0 ? 'Higher Battery Capacity' : 'Apple Ecosystem Synergy'
        ],
        bestForSummary: {
          [skuA]: modelA.category === 'Laptops' ? 'Peak Creative Studio Work & Apple Silicon Longevity' : 'Cinematic Video Creators & Apple Ecosystem Users',
          [skuB]: modelB.category === 'Laptops' ? 'Extreme Multitasking, OLED Brilliance & Windows Customizability' : 'Power Gamers, Note-Takers & Multitasking Power Users'
        }
      }
    };
  }
}
