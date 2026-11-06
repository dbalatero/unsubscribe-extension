# What we are building

I want you to make a Chrome extension that will do the following:

- When I open an email in FastMail, if there is an unsubscribe link I want you to capture it automatically
- When you capture a link, extension should infer the sender based on the From name (like Sephora) or the domain (no-reply@sephora.com)
- If we've already seen this domain, don't capture again

This should put all the unsubscribe links into a small database for me to take care of.

The workflow should be as follows:

1. I scan the list and mark any that are OK to keep. Those marked kept should stay in the database and disappear from the list. They should also never be prompted again to be unsubscribed. Duplicate detection doesn't have to be perfect - if the sender changes their domain or from name or something, I'm fine with considering it again.

2. For any I don't mark OK to keep, there should be a single button that opens all the unsubscribe links in a new Chrome window, one tab per link.

3. I will then manually go thru and smash the Unsubscribe buttons myself.
