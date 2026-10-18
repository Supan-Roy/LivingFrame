export interface VideoScene {
  timeSec: number;
  image: any;
  speaker: string;
  caption: string;
}

export interface VideoStreamMeta {
  durationSec: number;
  scenes: VideoScene[];
}

export const videoStreams: Record<string, VideoStreamMeta> = {
  'behind-the-screams': {
    durationSec: 12,
    scenes: [
      {
        timeSec: 0,
        image: require('../assets/frames/behind_the_screams_0.jpg'),
        speaker: 'SOUNDSTAGE A',
        caption: '[Eerie orchestral music swells as the cameras roll...]',
      },
      {
        timeSec: 3,
        image: require('../assets/frames/behind_the_screams_1.jpg'),
        speaker: 'DIRECTOR',
        caption: "Alright take four! Screaming choir, let's hear absolute terror!",
      },
      {
        timeSec: 6,
        image: require('../assets/frames/behind_the_screams_2.jpg'),
        speaker: 'VOCAL COACH',
        caption: 'Breathe from the diaphragm! Do not strain the vocal cords!',
      },
      {
        timeSec: 9,
        image: require('../assets/frames/behind_the_screams_3.jpg'),
        speaker: 'HORROR ENSEMBLE',
        caption: '[Piercing, bone-chilling scream echoes across the studio set]',
      },
    ],
  },
  'cereal-streamz': {
    durationSec: 12,
    scenes: [
      {
        timeSec: 0,
        image: require('../assets/frames/cereal_streamz_0.jpg'),
        speaker: 'THEME SONG',
        caption: '[Uptempo Saturday morning cartoon theme music playing]',
      },
      {
        timeSec: 3,
        image: require('../assets/frames/cereal_streamz_1.jpg'),
        speaker: 'ANNOUNCER',
        caption: 'Grab your milk bowls for interstellar crunchy marshmallow madness!',
      },
      {
        timeSec: 6,
        image: require('../assets/frames/cereal_streamz_2.jpg'),
        speaker: 'CAPTAIN KRUNCHY',
        caption: 'Full speed ahead through the sugary milky way galaxy!',
      },
      {
        timeSec: 9,
        image: require('../assets/frames/cereal_streamz_3.jpg'),
        speaker: 'CARTOON CHORUS',
        caption: "Don't touch that dial! We will be right back after these messages!",
      },
    ],
  },
  'feline-assistant': {
    durationSec: 12,
    scenes: [
      {
        timeSec: 0,
        image: require('../assets/frames/feline_assistant_0.jpg'),
        speaker: 'HOME OFFICE',
        caption: '[Gentle acoustic morning score with rhythmic keyboard clatter]',
      },
      {
        timeSec: 3,
        image: require('../assets/frames/feline_assistant_1.jpg'),
        speaker: 'DAVE',
        caption: 'Barnaby please, I have to finish presenting the Q3 revenue deck...',
      },
      {
        timeSec: 6,
        image: require('../assets/frames/feline_assistant_2.jpg'),
        speaker: 'ZOOM MEETING',
        caption: 'Dave, your senior cat executive just requested a 20% bonus in tuna.',
      },
      {
        timeSec: 9,
        image: require('../assets/frames/feline_assistant_3.jpg'),
        speaker: 'BARNABY THE CAT',
        caption: '[Loud, deep contented purring broadcasts through the headset mic]',
      },
    ],
  },
};

export const getStreamScene = (
  itemId: string,
  currentTimeSec: number,
  fallbackPoster?: string,
): {image: any; speaker?: string; caption?: string} => {
  const stream = videoStreams[itemId];
  if (!stream || stream.scenes.length === 0) {
    return {
      image: fallbackPoster ? {uri: fallbackPoster} : null,
      speaker: 'CINEMA AUDIO',
      caption: '[Live cinema soundscape active • Ambient sync enabled]',
    };
  }

  const loopTime = currentTimeSec % stream.durationSec;
  // Find the scene matching current time
  let activeScene = stream.scenes[0];
  for (const scene of stream.scenes) {
    if (loopTime >= scene.timeSec) {
      activeScene = scene;
    }
  }

  return {
    image: activeScene.image,
    speaker: activeScene.speaker,
    caption: activeScene.caption,
  };
};
