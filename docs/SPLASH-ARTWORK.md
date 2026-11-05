# Official splash artwork

v5.12 uses original upstream PNG assets, not the generated concept image.

- `app/src/main/res/drawable-nodpi/warzone_official_backdrop.png` is the exact
  `bdrops/backdrop6.png` from Warzone2100/data-texpages revision
  `009ec2f652a6230d8315cc3db4eadb5690f18fbd` (Warzone 2100 4.7.0's asset pin).
  Author: jorzi, 2010-2011; CC0.
  https://github.com/Warzone2100/data-texpages/blob/009ec2f652a6230d8315cc3db4eadb5690f18fbd/bdrops/backdrop6.png
- `warzone_official_logo.png` is byte-identical to the official bundled
  `/data/base/images/frontend/image_fe_logo.png` in the existing engine package.
  Warzone 2100 Project; see existing upstream GPL/source notices.
- Credits: https://github.com/Warzone2100/warzone2100/blob/4.7.0/COPYING.NONGPL

The native splash draws the square backdrop uniformly by height with a matching
surround averaged from the source's outermost pixels and a narrow edge blend.
This preserves the missile pod and
tracks without stretching the vehicle. The logo is a separate native image;
footer labels are live Android controls. Music and loading use the same art.

Dustfall and Iron Valley are display names for td1 and td2. Internal map IDs,
authored names/data, original authors and Towers rules remain intact.
