PLEASE ANSWER QUESTIONS WITHIN THIS BLOCK
# Questions that you should answer
Q: When changing schema, are we calling an update to make sure everything has the new fields or just assuming empty for them?
A: Just assuming empty. The schema update only saves the new definition — existing items are not modified. The frontend gracefully handles missing fields by displaying them as empty/blank. This is intentional to avoid expensive migrations on every schema edit.

DON'T EDIT ANYTHING BELOW THIS LINE IN THIS FILE! BELOW IS ONLY TO BE EDITED MANUALLY!


# Bugs
<!-- * Setup instructions:  used ./.venv/Script/Activate.ps1 for Windows, no .venv/bin folder -->
<!-- * currency doesn't pad zeroes (ie "7.5" USD), but then it would depend on what the currency is -->

* Collection view displays a maximum of 50 items, I want to see all items or have a second page
* Rating field type doesn't show a star for when the maximum value in the config ends in 0.5, it just gets visually cut off at the whole star
* Collection view sorting by "Date Added" only applies the sort to the first listed schema's items, and then just leaves all other schema's items sorted by their default sort and by schema





# QoL
* Graph View or Mind Map type view of a collection with filters.
* Size of grid view items should should be any number, and maybe a plus and minus instead of a 2,3,4,5 thing
<!-- * Be able to import csv as long as columns exist in the schema. -->
* Hierarchy filters on serarch screen could be split into two different dropdowns instead of one
    * Make them look somewhat better, it looks too indistinguishable from other fields. Also a second field appearing is weird.

<!-- * If a field is a type, it should prevent the user from typing things that aren't that type. say a nuimber field should not allow non-number related characters -->


## Search:
* new color field type that could use a color picker as input, and then display close-ish colors on search?
    * Would require color classification on the images or edge detection to get the subject, average the color pixels, and then get nearest color



# Done

* Schema selection in a collection search does not remove filter values, like brand is shared between two schemas, hot cocoa and coffee, and coffee brands show up when i select to search on a hot cocoa schema
* default sort should be the default option for sort-by on the collection page
* Range is too wide and goes off the modal. Maybe make the number fields smaller. this applies to the edit mode as well
* KVPs on edit mode after creation are also too large and go off the card


* Key Value Pair Colons should line up in display
* KVPs and Range are object-object in the search
* Top level Hierarchy filters on serarch screen don't show correct number of items inclusive of all filtered subcategories. just says 0
* You can't check off the checklist items
* Can't decrement to infinity for counts of item constraints. Also if it is infinity, incrementing should become 1
* The table view in the collection should be side scrollable, sticking the image, name, and click box to the left but everything else side scrollable so I can scroll to which field I want
    * This works somewhat but text areas are very long. Maybe they should be truncated to a little bit when displayed.
    * Name compresses against the image column a little bit.
    * Text seems to overlap when scrolling in the list over the image and name.
* When transparent background of image, it becomes green for some reason. How about just keep it transparent?
    * I think this comes from the thumbnail conversion sometimes. It's only present on the item images list and not the collection view anymore



<!-- * Stars should be editable by number as well as set a min and max in the schema. Fractional values should also be allowed.
    * Partially. I'm seeing 0.5 steps allowed via manual typing input, but I cannot configure the min/max value for the rating in the schema -->
* Number fields like for rating and such, if 0, should change number when a number is typed since you have to select it and override it, or do cursor shenanegans since you can't remove 0.
    * Sort of. I can enter a number after 0, but it renders at "03", and does update the rating stars. If I save the item and then go back into edit mode, it is updated to just "3".

* All types (including text areas) should be listable other than things that are themselves lists
    * dropdown shouldn't be infinitable, since then it becomes a multiselect, or maybe then dropdown should be for one option always and multiselect can have a max options that can be selected but is default to infinity?
    * boolean being a multientry field doesn't make sense to me, idk maybe a pattern of on-off, but then why not use 0-1 in a text based field
    * if a computed field is utilizing a multi-entry field, the computation is then empty because it isn't handled
    * more than one rating doesn't show stars but instead just the numbers

* Since default sort might be different, group them by default per schema
    * I'm seeing it group the items by name first for "test collection" and then after clikcing a schema and then clicking back to all, the items are grouped by schema and sorted by their default sorts in there (and not meshing even if they are a shared field)

* Sorting in list view changes order of table fields. This should not happen
* dropdown with custom options doesn't show the custom option in the search filter
* range field isn't filterable on search
* unit field only shows the default unit string on search
* A computed field type displays no value if based on a multi-entry field in its formula
* Collection view's table view is broken, shows blank page
* unit field only shows the default unit string on search filter options
* (unsure, can't test) Sorting in list view changes order of table fields. This should not happen
* (brain can't write this well rn) default sorting by schema when multiple schemas is not working