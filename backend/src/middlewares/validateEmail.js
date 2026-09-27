async function validateEmail(req,res, next){
    let {email} = req.body;
    let emailRegex =/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    // if(emailRegex.test(email)){
    // Test the trimmed string: the controller trims + lowercases (BUG-86), so
    // " foo@x.com " must pass here too. The typeof check also stops an array
    // like ["a@b.co"] passing the regex (it stringifies) and crashing later.
    if(typeof email === 'string' && emailRegex.test(email.trim())){
        next();
    }
    else{
        res.status(400).send({message: "Invalid email"});
    }
}

module.exports = validateEmail