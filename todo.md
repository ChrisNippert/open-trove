PLEASE ANSWER QUESTIONS WITHIN THIS BLOCK
# Questions that you should answer
Q: When changing schema, are we calling an update to make sure everything has the new fields or just assuming empty for them?
A: Just assuming empty. The schema update only saves the new definition — existing items are not modified. The frontend gracefully handles missing fields by displaying them as empty/blank. This is intentional to avoid expensive migrations on every schema edit.

DON'T EDIT ANYTHING BELOW THIS LINE IN THIS FILE! BELOW IS ONLY TO BE EDITED MANUALLY!


# Bugs
<!-- * Setup instructions:  used ./.venv/Script/Activate.ps1 for Windows, no .venv/bin folder -->

# QoL

## Images


## Linked Data:
* When an item is deleted, it's ID spot presumably can be taken, since there was an item that was deleted, and a new item took it's place, and now the links point to the wrong item since the ID is the same.
    * Fixed by giving each item a unique uuid
    * Depending on the sql database schema, this might require a change from some int to a string since items will have alphanumeric codes

## Export/Import:

## Search:
* new color field type that could use a color picker as input, and then display close-ish colors on search?
    * Would require color classification on the images or edge detection to get the subject, average the color pixels, and then get nearest color



## collection view:



# Done
* make Named Image Field a label so someone can put a name to an image. for example, x view (and then its an image of the X view of some 3d object or smth)
* Add some basic templates
* Add a tutorial/example schema with data and such
* Want to drag field boxes in the schema editor to reorder them
* Want to have a data field type for linking to other already added items (by id? or row?)
* option to add a picture as a thumbnail for the overall collection in the collection view
* Import the actual schemas themselves (can just be as simple as copy paste json lol)

* would be nice to add an image through a url too
* user should be able to click to view an image on an item in full size (ie not in edit mode) (currently the thumbnail image is larger than the actual image display lol)
* deleting an item doesn't cleanup the associated images from the folder
* link schema config lists "Any Collection" as an option in the dropdown, but that should be a placeholder for "Select a Collection", as it doesn't let you use that field until you fully populate it in the schema ("Any schema" from that collection works fine)
* UI bug: hitting escape from the search for linking an item unfocuses from the search box but leaves the list div visible
* adding a linked item to an item, then deleting the linked item keeps the link on the parent item, when the link goes nowhere when clicked
* exporting at the collection level is just data, not schemas, so importing it to another collection doesn't work unless the there is only one schema type
    * Collection export/import should handle schemas additionally to data maybe?
    * Import allows you to select an existing schema to import data as, but then it imports all of the data types from the prior export as that schema (even if they don't match), so maybe exporting data by data type option?
* no images get brought over, might just want to null those fields on import
* Would be nice to have a dropdown next to the collection dropdown to select a schema or "any schema" (what it searches through now)
* multiselect search filters display their options as checkboxes, but don't find any results, and filtering by any of those option doesn't display the corresponding items
* would be nice to collect the values for text fields (not the textarea fields) in a set and then present them as filter checkbox options (default is checked), for searching across fields such as brand, size, material etc.
* number range fields (like quantity or price), should not display a search filter option if the range is just one number (ie 50 to 50)
* would be nice to be able to sort data by a field (currently seems like this sorts by most recently added item)
* would be nice to be able to duplicate an item (excluding its images) for creating similar items easily
* would be nice to make different sections collapsible in the add a new item modal, but default as all expanded
* Can't edit name of item after initial creation
* Can't edit collection name or description after creation
* would be nice to have a URL data field type that makes the string it into a clickable hyperlink
* boolean field type should default to displaying "No" if that field isn't populated on an item (currently have to check and then uncheck to get the dash to go away)
* bug where if you create an item with image fields not populated, then go to edit and add an image to that field, then add an image to the main images list the named field image gets unpopulated and just moved to the main images list
* new field type for just date additionally to datatime

* Change the UI for adding an image instead of three buttons (camera, link, file) have one button that brings up a popup modal and gives you options there
    * This modal should also be used for the named image field
    * For the named image field, it should also let you select images that have been uploaded with the item
* Would be nice to choose to upload a new file or select from the image already associated with an item for a named image field
* uploading an image then cancelling the change doesn't remove the uploaded image from the folder, it's now just orphaned data
* Adding a photo, and then removing the photo, and adding a different photo just adds back the photo i removed, and i can click and it will fullscreen into the new photo. This is partially broken until refreshed.
* Copy pasting schemas work

* Image url input does not need to be in a dropdown lol
* Make key bind ctrl+s save when in edit mode
* Add images to the items in a table view in collection
* For linked items that don't exist, make the linked text red

* Add a back button that feels intuitive to he top left
* Add thumbnail image for a linked item next to the link when applicable
* might be a pain in the ass, but it would be nice for search filters to be parsed from the url, so going back a page after viewing an item from the search page preserved the search results
* Improve text search as "Japa" doesn't pop up "Japanese"

* In the heirarchy field, instead of just saying Collections/Groups/<Itemname>, instead replace collections and groups with the actual collection and group selected.
* When changing filters, little loading icon
* multiselect for delete would be a nice to have, but still prompt the user for confirmation before actually removing (would be good for cleanig up import mistakes lol)

* For every datatype, allow a schema defined value associated with how many there are
    * 0 would be any amount, say for a list of links for some field
    * \>0 would just limit to that amount.
* would be cool to have a multi-level dropdown of options so that we can define heirarchical droptdown esque structures. Say that we have "Letters", and "a" is a child of that. We also have "Integers" of which "1" and "2" are children. this should be configurable to any heirarchical level the user needs. When selecting something like "2", it should automatically set the outer dropdown to "Integers"
    * double wide, like how textarea spans both columns when displayed to the user
    <!-- * Could take in a string of json as the schema config for the options -->
    <!-- * The first dropdown configures the second dropdown's options -->
    * ie: categorizing "tops" could have blouses, tank tops, sweaters etc, while "bottoms" have pants, skirts, etc.
    * This is done however works a little differently than expected
* When filtering, can you modify all the counts within the filter parameters? Such as if I select Ram=8, all the options with ram=8 are the only ones that make up the numbers for the other filter counts.

* When refresh, it flashes light theme and then goes to dark if i have selected dark. Can we make it so it doesn't flashbang

* Tags that are too long have a non-fitting background if the column is too small. maybe just make it a square with rounded corners instead of  rounded sides.
* Add Group Edit if all the items selected are the same type. if not, grey it out. This should bring up one of the items and then any change made in that item propogates to all the selected items when in group edit mode.

* Make Edit button for schemas more intuitive or easier to click.

* Can you make the max count be a bit more intuitive?
* Add skeletons to make the UI feel smoother
* Add some UI animation fluff that is lightweight but makes the UX feel nice

* for count, the plus and minus should be more clickable, and the number maybe typeable? Also if no other config options, please remove the config dropdown as it shows nothing

* Think there is a better way to display the schema? it seems vertically verbose if you know what I mean. WHat are your thoughts?
