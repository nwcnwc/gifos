/* themes/eggs.js — bonus seed apps for the DEFAULT computer. None by default.
 *
 * To give a numbered computer an app the others don't have, drop a
 * themes/<digit>/eggs.js that calls GifOS.addEggs([...]). Each egg is a
 * self-contained GifOS app:
 *
 *   GifOS.addEggs([{
 *     name:   'Cowsay.gif',        // desktop label
 *     appId:  'cowsay',            // stable id (icon art falls back to a letter
 *                                  //   unless the theme's pack draws this subject)
 *     accent: [51, 255, 119],      // icon tint [r,g,b]
 *     folder: 'Tools',             // MUST match a seeded folder: Games, Studio,
 *                                  //   Tools, Social, IRL Games
 *     html:   '<!doctype html>…',  // the whole app
 *   }]);
 *
 * The default apps are shared and themed automatically (this file is only for
 * per-computer extras), so most theme folders won't ship an eggs.js at all.
 */
