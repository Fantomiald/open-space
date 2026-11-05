import { roomTags } from '../../shared/tags.ts';
import { tagHue } from '../design/tag-colors.ts';

/**
 * A session's tags side by side, each in the colour of its name when the settings colour them (Preferences.tagColors).
 * `short`: where room is tight, the first ones then "+N", as on the name tags of the room.
 */
export function TagChips({ tags, className, short = false }: { tags: readonly string[] | undefined; className?: string; short?: boolean }) {
  const classes = className ? `cp-tag ${className}` : 'cp-tag';
  const { shown, more } = short ? roomTags(tags ?? []) : { shown: tags ?? [], more: 0 };
  return (
    <>
      {shown.map((tag) => <span key={tag} className={classes} data-hue={tagHue(tag)}>{tag}</span>)}
      {more > 0 && <span className={classes} data-more="true" title={(tags ?? []).slice(shown.length).join(', ')}>+{more}</span>}
    </>
  );
}
