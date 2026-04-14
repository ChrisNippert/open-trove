PLEASE ANSWER QUESTIONS WITHIN THIS BLOCK
# Questions that you should answer
Q: When changing schema, are we calling an update to make sure everything has the new fields or just assuming empty for them?
A: Just assuming empty. The schema update only saves the new definition — existing items are not modified. The frontend gracefully handles missing fields by displaying them as empty/blank. This is intentional to avoid expensive migrations on every schema edit.

DON'T EDIT ANYTHING BELOW THIS LINE IN THIS FILE! BELOW IS ONLY TO BE EDITED MANUALLY!


# Bugs
* Schema selection in a collection search does not remove filter values, like brand is shared between two schemas, hot cocoa and coffee, and coffee brands show up when i select to search on a hot cocoa schema
* default sort should be the default option for sort-by on the collection page
* Since default sort might be different, group them by default per schema
* Range is too wide and goes off the modal. Maybe make the number fields smaller. this applies to the edit mode as well
* KVPs on edit mode after creation are also too large and go off the card
* Stars should be editable by number as well as set a min and max in the schema. Fractional values should also be allowed.
* Number fields like for rating and such, if 0, should change number when a number is typed since you have to select it and override it, or do cursor shenanegans since you can't remove 0.
* Key Value Pair Colons should line up in display
* KVPs and Range are object-object in the search
* Top level Hierarchy filters on serarch screen don't show correct number of items inclusive of all filtered subcategories. just says 0
* You can't check off the checklist items
* Can't decrement to infinity for counts of item constraints. Also if it is infinity, incrementing should become 1
* The table view in the collection should be side scrollable, sticking the image, name, and click box to the left but everything else side scrollable so I can scroll to which field I want
    * This works somewhat but text areas are very long. Maybe they should be truncated to a little bit when displayed.
    * Name compresses against the image column a little bit.
    * Text seems to overlap when scrolling in the list over the image and name.
* All types (including text areas) should be listable other than things that are themselves lists
* When transparent background of image, it becomes green for some reason. How about just keep it transparent?
    * I think this comes from the thumbnail conversion sometimes. It's only present on the item images list and not the collection view anymore

<!-- * Setup instructions:  used ./.venv/Script/Activate.ps1 for Windows, no .venv/bin folder -->
<!-- * currency doesn't pad zeroes (ie "7.5" USD), but then it would depend on what the currency is -->




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
* When selecting a filter that has no results, all the filters disappear. Please keep the fields that have active filters and a clear filters button.
* If a specific schema is specified instead of "any schema" on the search screen, then only the filters related to that schema should be in the left panel
* Call it "reference" instead of "link" for linked items
* Referenced items on an item when viewed from the search is displayed as [object Object] (ie ToString should just substitute the linked item's name)
* Hierarchy filters on serarch screen don't let you filter by the first selector (ie: "Tops (All)" shows no items)
* On the collection view, the "All (x)" takes on a number x of whatever is currently being viewed (clicking another schema type lowers x to that schema's count)
* If a field is populated on an item, then that field name is changed in schema, then the old field is still saved internally on that item, and the new field name is empty
    * When a rename happens, it should save the data under the new field name instead of orphan the data and have nothing under the new field.
* Item Counts for schemas don't update till a refresh when new items are added
* Ability to see json of individual items
* Key value pair data type (list of kvps could be useful)
* Maybe a checklist type field?
* When adding a reference to an item, it would be nice to be able to see an image of said item as some items may have the same name but different images.
* Remember collection view's sort setting between visits (ie: clicking into an item then going back resets the sort order), could be put on URL parameters for client solution or stored in JSON as a more permanent setting
* List of strings on the search dropdown needs to be flattened
    * The whole array of strings IS the item for the filter, but we want to accumulate them over entries
* Save schema shouldn't pull you out of the schema editor
* Units has a tough time being a list
* When editing a collection description, hitting enter should save it
* Range Field

* When ctrl+s on schema page it should save
* For image fields given URLs, download the URLs just in case the source goes away
* Duplicate Schema button
* In list view, sort by clicking on the columns would be super nice
* On schema editing, there should be a field for default sort which sorts alphabetically by some category (like so all things from a certain brand are together on the default view)
* Fit the image to the square if its not a square because when its zoomed in it isn't always easy to related* Thumbnail gets scaled down when it's grainy. Maybe just scale as css
    * Maybe only use thumbnail when in list view as opposed to grid view
* ability to import a Section from existing schema (allows any schema from any collection)
* For dropdowns, add an additional configuration to allow user insertable fields
* Star Rating field