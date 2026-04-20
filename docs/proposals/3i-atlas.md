# 3I/ATLAS

For a **parsec-scale Found in Space plot**, the cleanest current approach is to treat 3I/ATLAS as two straight ICRS rays that meet at the Sun, with the bend between them coming mainly from the Jupiter encounter. A 2025 dynamical study integrated 500 clones backward and forward for 100 years and reported both the inbound and outbound sky directions and ICRS velocity components; that is a good practical basis for your 3D interstellar projection. JPL Horizons also provides the current inner-solar-system non-gravitational orbit fit for finer work later. ([arXiv][1])

For the **interstellar-scale rays**, I would use these as your primary plotting parameters. These vectors are derived from the paper’s reported RA/Dec and ICRS velocity components using the usual ICRS mapping
[
(x,y,z)=(\cos\delta\cos\alpha,\ \cos\delta\sin\alpha,\ \sin\delta).
]
The paper gives the inbound direction 100 years in the past as **RA 294.9691°, Dec −19.0766°**, with ICRS velocity **(-23.198, +49.647, +18.943) km/s**, and the outbound direction 100 years in the future as **RA 95.321°, Dec +19.8065°**, with ICRS velocity **(-4.98, +54.34, +19.65) km/s**. The corresponding radial speeds are about **57.995 km/s inbound** and **58.01 km/s outbound**. ([arXiv][1])

```json
{
  "object": "3I/ATLAS",
  "frame": "Sun-centered ICRS",
  "recommended_for_parsec_scale": {
    "inbound": {
      "sky_direction_ra_dec_deg": [294.9691, -19.0766],
      "source_direction_unit_vector": [0.398947, -0.856751, -0.326832],
      "motion_unit_vector": [-0.400096, 0.856262, 0.326710],
      "speed_km_s": 57.995,
      "speed_pc_per_myr": 59.312
    },
    "outbound": {
      "sky_direction_ra_dec_deg": [95.3210, 19.8065],
      "destination_direction_unit_vector": [-0.087250, 0.936788, 0.338845],
      "motion_unit_vector": [-0.085865, 0.936930, 0.338805],
      "speed_km_s": 58.010,
      "speed_pc_per_myr": 59.328
    }
  }
}
```

The distinction is:

* `source_direction_unit_vector` = where the comet is/was on the sky relative to the Sun.
* `motion_unit_vector` = the direction it is actually moving along the path.

For your renderer, the simplest form is:

```text
r_in(t)  = -u_in_source * d          // ray from Sun toward the source region
r_out(t) =  u_out_dest  * d          // ray from Sun toward the exit region
```

or, if you want the **velocity-defined trajectory axes** instead,

```text
r(t<0) = vhat_in  * s
r(t>0) = vhat_out * s
```

with `s` in pc and `speed ≈ 5.93e-5 pc/yr`. That gives you a clean large-scale inbound/outbound “through the solar system” visualization. The perihelion distance in the current JPL fit is only **1.35648 au**, which is about **6.6×10⁻⁶ pc**, so at your **0.25 pc visibility threshold** the solar-system miss distance is completely negligible. ([JPL Solar System Dynamics][2])

For the **bonus inner-solar-system layer**, JPL Horizons currently gives a heliocentric osculating solution at epoch **2026-02-19 TDB** with:

* **e = 6.1413514493**
* **q = 1.3564810572 au**
* **i = 175.116457085°**
* **Ω = 322.169608929°**
* **ω = 128.022869719°**
* heliocentric Cartesian state
  **r = (-1.8784657060, +3.5567870340, +1.3692598823) au**
  **v = (-0.0033933074, +0.0332425227, +0.0120114509) au/day**
  and non-gravitational parameters
  **DT = 9.478815 d**, **A1 = 5.3202e-8**, **A2 = 1.1482e-8**, **A3 = -6.8545e-9 au/day²**. ([JPL Solar System Dynamics][2])

For interpretation, the important fine-detail point is that the outbound branch is not just the mirror of the inbound branch. A later dynamical study finds the main planetary perturbation is from **Jupiter**, with a close approach around **2026-03-16** at about **0.357 au**; Mars is much less important. That is why using separate inbound and outbound vectors is the right thing to do for your interstellar plot. ([arXiv][1])

One caveat: the exact post-perihelion solution is still somewhat sensitive to non-gravitational modeling. A 2026 uncertainty analysis found JPL’s total acceleration estimate is broadly consistent, but systematic modeling choices can widen the true uncertainty budget. For your current visualization scale, though, the clone-integrated inbound/outbound vectors above are a sound working choice. ([arXiv][3])

If useful, I can turn this straight into a tiny Python or TypeScript helper that emits sample points for the inbound ray, outbound ray, and a stitched inner-solar-system segment.

[1]: https://arxiv.org/html/2511.16247v1 "Dynamical simulation of the Interstellar Comet 3I/ATLAS"
[2]: https://ssd.jpl.nasa.gov/api/horizons.api?ANG_FORMAT=%27DEG%27&CAL_TYPE=%27M%27&CENTER=%27500%4010%27&COMMAND=3I%3B&CSV_FORMAT=%27YES%27&ELM_LABELS=%27YES%27&EPHEM_TYPE=%27ELEMENTS%27&MAKE_EPHEM=%27YES%27&OBJ_DATA=%27NO%27&OUT_UNITS=%27AU-D%27&REF_PLANE=%27ECLIPTIC%27&REF_SYSTEM=%27ICRF%27&TLIST=%272025-07-11+21%3A58%3A36%27+&TP_TYPE=%27ABSOLUTE%27&format=text "ssd.jpl.nasa.gov"
[3]: https://arxiv.org/abs/2603.00782 "[2603.00782] Systematic and Statistical Uncertainties in the Non-Gravitational Acceleration of 3I/ATLAS"
