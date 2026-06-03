# C8 — `c8-station-types`

## Staffed vs. self-service kiosks: a closer look

**Audience:** Admin deciding how to deploy stations.

**Outcome:** You understand exactly what each station type can and can't do, and which to use where.

This expands on the station-type choice in **A1**. The type is set at enrollment and can't be changed afterward, so it's worth understanding the difference.

---

### What a staffed kiosk can do

A staffed kiosk has a volunteer present for every check-in. It can do everything:

- Regular check-in
- Checkout, including the blocked-pickup photo comparison
- Clearing a blocked-pickup gate when the operator confirms the person present isn't the blocked individual
- The "I'm here for pickup" ping

Because a trained person is making the call, a staffed kiosk is the only place where pickup and custody decisions happen.

---

### What a self-service kiosk can and can't do

A self-service kiosk sits at a turnstile-style entrance where families check themselves in without a volunteer hovering.

- **Can:** regular check-in
- **Cannot:** checkout — releasing a child always happens at a staffed kiosk, because the release gate is the parent's security code, not the device
- **Cannot:** clear a blocked-pickup entry — if a block applies, the family is routed to a staffed kiosk

---

### Why the limits exist

The restrictions aren't arbitrary. Releasing a child and clearing a custody restriction are judgment calls that a person has to make and stand behind. A self-service kiosk has no one to make that call, so it never does — which keeps those decisions defensible after the fact.

---

### Choosing per situation

- **Start staffed.** For a first deployment, and for any entrance where pickups happen, use staffed kiosks
- **Add self-service for volume.** A high-traffic check-in-only entrance is a good fit for self-service, as long as pickups and any blocked-pickup households are handled at a staffed station

[SCREENSHOT: c8-station-type-comparison]

---

### Related

- **A1 — First-time kiosk setup** (enrolling a station)
- **B4 — Blocked-pickup entries** (the gate self-service can't clear)
