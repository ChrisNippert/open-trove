

# Issues noticed 9/6/2026
- Naming a field the same thing in different sections results in data being shared between them. Should warn that filed name is already in use or block the user from multiple of the same fields.
- The default sorting saved in the schema displays the data by default accordingly, but does not update the default sort dropdown and error, which should reflect the default sorting field saved in the schema if the user hasn't touched it.
- Cannot override the default sorting if set in the json config, so dropdown is nonfuctional if the default storting is populated
- Clicking on a linked item should scroll up to the top of the page, currently doesn't
- The created thumbnail is being turned sideways for some jpg images, this is due to the exif metadata flag not being transferred to the created thumbnail for jpg type images
- the views only show 50 item cards in a collection at a time, even if the collection contains more items than 50
    - needs to either load all initially, paginate, or show an error of maximum reached
    - max should be configurable per collection

# Manual fixes implemented
- the main collection view is not using the thumbnail images => fixed
- the views only show 50 item cards in a collection at a time, even if the collection contains more items than 50 => upped to 500 for now